import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { toPrismaEnums } from "../utils/enumMapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env") });

const prisma = new PrismaClient();
const OLD_DATA_DIR = path.join(SERVER_ROOT, "old data");
const LOGS_DIR = path.join(SERVER_ROOT, "logs");
const BATCH_SIZE = 15; // Concurrent batch size for fast Supabase migration

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const ERROR_LOG_PATH = path.join(LOGS_DIR, "import_errors.log");
const SUMMARY_LOG_PATH = path.join(LOGS_DIR, "import_summary.json");

// Clear existing error log for new run
fs.writeFileSync(
  ERROR_LOG_PATH,
  `=== MILTON COLLEGE CSV IMPORT ERROR LOG [${new Date().toISOString()}] ===\n\n`,
);

function logError(fileName, rowIndex, recordId, message, errStack) {
  const entry = `[${new Date().toISOString()}] File: ${fileName} | Row: ${rowIndex + 2} | ID: ${recordId || "N/A"}\nError: ${message}\n${errStack ? `Stack: ${errStack}\n` : ""}${"-".repeat(80)}\n`;
  fs.appendFileSync(ERROR_LOG_PATH, entry);
}

/**
 * Robust CSV parser handling quotes, escaped quotes, and newlines
 */
function parseCSV(text) {
  const lines = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) {
        lines.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) {
      lines.push(row);
    }
  }

  if (lines.length === 0) return [];
  const headers = lines[0].map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const obj = {};
    headers.forEach((h, idx) => {
      let val = line[idx] !== undefined ? line[idx] : null;
      if (val === "" || val === "null" || val === "undefined") val = null;
      obj[h] = val;
    });
    return obj;
  });
}

function parseJsonField(val) {
  if (!val) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function parseFloatField(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function parseBooleanField(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  return String(val).toLowerCase() === "true";
}

function parseDateField(val) {
  if (!val) return undefined;
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Entity field transformation rules & upsert mapping
 */
const ENTITY_CONFIGS = [
  {
    fileName: "SchoolSettings_export.csv",
    modelName: "schoolSettings",
    transform: (row) => ({
      id: row.id,
      school_name: row.school_name || "Milton College",
      motto: row.motto,
      logo_url: row.logo_url,
      phone: row.phone,
      email: row.email,
      address: row.address,
      current_session: row.current_session,
      current_term: row.current_term,
      about: row.about,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "StaffRole_export.csv",
    modelName: "staffRole",
    transform: (row) => {
      let role = row.role || "Teacher";
      if (
        [
          "Form Teacher",
          "Form_Teacher",
          "Subject Teacher",
          "Subject_Teacher",
          "Class Teacher",
          "Class_Teacher",
        ].includes(role)
      ) {
        role = "Teacher";
      } else if (role === "Head Teacher" || role === "Head_Teacher") {
        role = "Head_Teacher";
      } else if (
        role === "Non-Academic Staff" ||
        role === "Non_Academic_Staff"
      ) {
        role = "Non_Academic_Staff";
      }
      return {
        id: row.id,
        user_email: row.user_email || "",
        user_name: row.user_name,
        role,
        status: row.status || "Active",
        created_date: parseDateField(row.created_date),
        updated_date: parseDateField(row.updated_date),
      };
    },
  },
  {
    fileName: "Parent_export.csv",
    modelName: "parent",
    syncUser: true,
    transform: (row) => ({
      id: row.id,
      parent_id: row.parent_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      occupation: row.occupation,
      custom_password: row.custom_password,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Teacher_export.csv",
    modelName: "teacher",
    syncUser: true,
    transform: (row) => ({
      id: row.id,
      staff_id: row.staff_id,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      phone: row.phone,
      passport_photo: row.passport_photo,
      section: row.section || "Secondary",
      teacher_type: row.teacher_type || "Subject Teacher",
      assigned_class: row.assigned_class,
      assigned_subjects: parseJsonField(row.assigned_subjects),
      form_teacher_class: row.form_teacher_class,
      qualification: row.qualification,
      date_employed: row.date_employed,
      status: row.status || "Active",
      user_id: row.user_id,
      custom_password: row.custom_password,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Student_export.csv",
    modelName: "student",
    syncUser: true,
    transform: (row) => ({
      id: row.id,
      admission_number: row.admission_number,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      middle_name: row.middle_name,
      date_of_birth: row.date_of_birth,
      gender: row.gender,
      passport_photo: row.passport_photo,
      section: row.section || "Secondary",
      current_class: row.current_class || "",
      state_of_origin: row.state_of_origin,
      local_government: row.local_government,
      blood_group: row.blood_group,
      genotype: row.genotype,
      tribe: row.tribe,
      sport_house: row.sport_house,
      weight: parseFloatField(row.weight),
      height: parseFloatField(row.height),
      parent_id: row.parent_id,
      parent_name: row.parent_name,
      parent_phone: row.parent_phone,
      parent_email: row.parent_email,
      address: row.address,
      admission_date: row.admission_date,
      status: row.status || "Active",
      current_term: row.current_term,
      current_session: row.current_session,
      custom_password: row.custom_password,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "NonAcademicStaff_export.csv",
    modelName: "nonAcademicStaff",
    syncUser: true,
    transform: (row) => ({
      id: row.id,
      staff_id: row.staff_id,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email,
      phone: row.phone,
      role: row.role || "Staff",
      department: row.department,
      custom_password: row.custom_password,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Subject_export.csv",
    modelName: "subject",
    transform: (row) => {
      const parsedClasses = parseJsonField(row.classes);
      const className = row.class || (Array.isArray(parsedClasses) ? parsedClasses.join(", ") : row.classes);
      return {
        id: row.id,
        name: row.name || "",
        code: row.code,
        section: row.section,
        teacher_id: row.teacher_id,
        teacher_name: row.teacher_name,
        class: className,
        status: row.status || "Active",
        created_date: parseDateField(row.created_date),
        updated_date: parseDateField(row.updated_date),
      };
    },
  },
  {
    fileName: "ParentStudent_export.csv",
    modelName: "parentStudent",
    transform: (row) => ({
      id: row.id,
      parent_email: row.parent_email || "",
      parent_id: row.parent_id,
      student_id: row.student_id || "",
      student_name: row.student_name,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Result_export.csv",
    modelName: "result",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id || "",
      student_name: row.student_name,
      admission_number: row.admission_number,
      class: row.class || "",
      section: row.section,
      term: row.term || "First Term",
      session: row.session || "",
      subject_id: row.subject_id || "",
      subject_name: row.subject_name,
      first_ca: parseFloatField(row.first_ca),
      second_ca: parseFloatField(row.second_ca),
      third_ca: parseFloatField(row.third_ca),
      exam_score: parseFloatField(row.exam_score),
      total: parseFloatField(row.total),
      grade: row.grade,
      remark: row.remark,
      subject_position: parseFloatField(row.subject_position),
      class_average_score: parseFloatField(row.class_average_score),
      teacher_id: row.teacher_id,
      teacher_comment: row.teacher_comment,
      form_teacher_comment: row.form_teacher_comment,
      principal_comment: row.principal_comment,
      head_teacher_comment: row.head_teacher_comment,
      class_position: parseFloatField(row.class_position),
      total_in_class: parseFloatField(row.total_in_class),
      total_score_all_subjects: parseFloatField(row.total_score_all_subjects),
      school_fees_arrears: parseFloatField(row.school_fees_arrears) || 0,
      school_fees_current: parseFloatField(row.school_fees_current) || 0,
      next_term_begins: row.next_term_begins,
      affective_traits: parseJsonField(row.affective_traits),
      psychomotor_skills: parseJsonField(row.psychomotor_skills),
      promotion_status: row.promotion_status,
      status: row.status || "Draft",
      approved_by: row.approved_by,
      approved_date: row.approved_date,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "ReportCard_export.csv",
    modelName: "reportCard",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id || "",
      student_name: row.student_name,
      class: row.class,
      section: row.section,
      term: row.term,
      session: row.session,
      pdf_url: row.pdf_url,
      status: row.status || "Draft",
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "ResultToken_export.csv",
    modelName: "resultToken",
    transform: (row) => ({
      id: row.id,
      token: row.token || "",
      student_id: row.student_id,
      student_name: row.student_name,
      admission_number: row.admission_number,
      class: row.class,
      term: row.term,
      session: row.session,
      is_used: parseBooleanField(row.is_used),
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Attendance_export.csv",
    modelName: "attendance",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id || "",
      student_name: row.student_name,
      admission_number: row.admission_number || null,
      section: row.section || null,
      class: row.class || "",
      term: row.term,
      session: row.session,
      date: row.date || "",
      status: row.status || "Present",
      remarks: row.remarks || null,
      marked_by: row.marked_by || row.recorded_by || null,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Assignment_export.csv",
    modelName: "assignment",
    transform: (row) => ({
      id: row.id,
      title: row.title || "",
      description: row.description,
      subject_id: row.subject_id || "",
      subject_name: row.subject_name,
      class: row.class || "",
      section: row.section,
      teacher_id: row.teacher_id || "",
      teacher_name: row.teacher_name,
      due_date: row.due_date,
      max_score: parseFloatField(row.max_score || row.total_marks) || 100,
      attachment_url: row.attachment_url,
      status: row.status || "Active",
      term: row.term,
      session: row.session,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "AssignmentSubmission_export.csv",
    modelName: "assignmentSubmission",
    transform: (row) => ({
      id: row.id,
      assignment_id: row.assignment_id || "",
      student_id: row.student_id || "",
      student_name: row.student_name,
      submission_text: row.submission_text,
      file_url: row.file_url,
      submitted_date: row.submitted_date,
      score: parseFloatField(row.score),
      feedback: row.feedback || row.teacher_feedback,
      status: row.status || "Submitted",
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "CBTExam_export.csv",
    modelName: "cBTExam",
    transform: (row) => {
      const parsedClasses = parseJsonField(row.classes);
      const className = row.class || (Array.isArray(parsedClasses) ? parsedClasses[0] : row.classes) || "";
      return {
        id: row.id,
        title: row.title || "",
        subject_id: row.subject_id || "",
        subject_name: row.subject_name,
        class: className,
        section: row.section,
        term: row.term,
        session: row.session,
        duration_minutes: parseFloatField(row.duration_minutes) || 30,
        total_marks: parseFloatField(row.total_marks) || 100,
        questions: parseJsonField(row.questions),
        status: row.status || "Draft",
        created_by: row.created_by,
        created_date: parseDateField(row.created_date),
        updated_date: parseDateField(row.updated_date),
      };
    },
  },
  {
    fileName: "CBTResult_export.csv",
    modelName: "cBTResult",
    transform: (row) => ({
      id: row.id,
      exam_id: row.exam_id || "",
      student_id: row.student_id || "",
      student_name: row.student_name,
      score: parseFloatField(row.score) || 0,
      total_questions: parseFloatField(row.total_questions) || 0,
      correct_answers: parseFloatField(row.correct_answers) || 0,
      answers: parseJsonField(row.answers),
      started_at: row.started_at,
      completed_at: row.completed_at,
      theory_score: parseFloatField(row.theory_score),
      total_score: parseFloatField(row.total_score),
      theory_graded: parseBooleanField(row.theory_graded),
      graded_by: row.graded_by,
      graded_at: row.graded_at,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "SchoolFeePayment_export.csv",
    modelName: "schoolFeePayment",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id || row.admission_number || "N/A",
      student_name: row.student_name,
      admission_number: row.admission_number,
      class: row.class,
      amount: parseFloatField(row.amount || row.total_amount) || 0,
      amount_paid: parseFloatField(row.amount_paid) || 0,
      balance: parseFloatField(row.balance) || 0,
      term: row.term,
      session: row.session,
      payment_date: row.payment_date,
      payment_method: row.payment_method || "Cash",
      receipt_number: row.receipt_number,
      status: row.status || "Paid",
      remarks: row.remarks || row.notes,
      recorded_by: row.recorded_by,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "AdmissionApplication_export.csv",
    modelName: "admissionApplication",
    transform: (row) => ({
      id: row.id,
      application_number: row.application_number,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      middle_name: row.middle_name,
      date_of_birth: row.date_of_birth,
      gender: row.gender,
      passport_photo: row.passport_photo,
      section: row.section || "Secondary",
      applying_for_class: row.applying_for_class || "",
      parent_name: row.parent_name || "",
      parent_phone: row.parent_phone || "",
      parent_email: row.parent_email || "",
      address: row.address,
      state_of_origin: row.state_of_origin,
      previous_school: row.previous_school,
      status: row.status || "Pending",
      test_score: parseFloatField(row.test_score),
      interview_date: row.interview_date,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "ArchivedStudent_export.csv",
    modelName: "archivedStudent",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id,
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      admission_number: row.admission_number,
      class_at_archive: row.class_at_archive,
      archive_reason: row.archive_reason,
      archived_date: row.archived_date,
      archived_by: row.archived_by,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Timetable_export.csv",
    modelName: "timetable",
    transform: (row) => ({
      id: row.id,
      class: row.class || "",
      day_of_week: row.day_of_week || "",
      period: row.period || "",
      start_time: row.start_time,
      end_time: row.end_time,
      subject_id: row.subject_id,
      subject_name: row.subject_name,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "LessonNote_export.csv",
    modelName: "lessonNote",
    transform: (row) => ({
      id: row.id,
      topic: row.topic || "",
      subject_id: row.subject_id || "",
      subject_name: row.subject_name,
      class: row.class || "",
      teacher_id: row.teacher_id || "",
      teacher_name: row.teacher_name,
      week: parseFloatField(row.week),
      term: row.term,
      session: row.session,
      content: row.content,
      attachment_url: row.attachment_url,
      status: row.status || "Draft",
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Newsletter_export.csv",
    modelName: "newsletter",
    transform: (row) => ({
      id: row.id,
      title: row.title || "",
      content: row.content || "",
      author: row.author,
      attachment_url: row.attachment_url,
      published_date: row.published_date,
      status: row.status || "Draft",
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Gallery_export.csv",
    modelName: "gallery",
    transform: (row) => {
      const parsedImages = parseJsonField(row.images);
      const imageUrl = Array.isArray(parsedImages) ? parsedImages[0] : row.image_url || row.images;
      return {
        id: row.id,
        title: row.title || "",
        description: row.description,
        category: row.category,
        image_url: imageUrl || "",
        uploaded_by: row.uploaded_by,
        created_date: parseDateField(row.created_date),
        updated_date: parseDateField(row.updated_date),
      };
    },
  },
  {
    fileName: "Calendar_export.csv",
    modelName: "calendar",
    transform: (row) => ({
      id: row.id,
      title: row.title || "",
      description: row.description,
      start_date: row.start_date || "",
      end_date: row.end_date,
      category: row.category,
      term: row.term,
      session: row.session,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Message_export.csv",
    modelName: "message",
    transform: (row) => ({
      id: row.id,
      sender_email: row.sender_email || "",
      sender_name: row.sender_name,
      receiver_email: row.receiver_email || "",
      receiver_name: row.receiver_name,
      subject: row.subject,
      body: row.body || "",
      is_read: parseBooleanField(row.is_read),
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Award_export.csv",
    modelName: "award",
    transform: (row) => ({
      id: row.id,
      title: row.title || "",
      description: row.description,
      recipient_type: row.recipient_type,
      recipient_name: row.recipient_name,
      date_awarded: row.date_awarded,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Discipline_export.csv",
    modelName: "discipline",
    transform: (row) => ({
      id: row.id,
      student_id: row.student_id || "",
      student_name: row.student_name,
      incident: row.incident || "",
      action_taken: row.action_taken,
      date: row.date,
      reported_by: row.reported_by,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
  {
    fileName: "Rating_export.csv",
    modelName: "rating",
    transform: (row) => ({
      id: row.id,
      teacher_id: row.teacher_id || row.user_email,
      teacher_name: row.teacher_name || row.user_name,
      score: parseFloatField(row.score || row.rating),
      comment: row.comment || row.review,
      rated_by: row.rated_by || row.user_name,
      created_date: parseDateField(row.created_date),
      updated_date: parseDateField(row.updated_date),
    }),
  },
];

async function syncUserRecord(record, profileType) {
  try {
    let email = record.email || record.parent_email || "";
    let username =
      record.staff_id || record.admission_number || record.parent_id || email;
    let role = "student";

    if (profileType === "Teacher") {
      role = "teacher";
      if (record.teacher_type === "Head Teacher" || record.teacher_type === "Head_Teacher") role = "head_teacher";
      if (record.teacher_type === "Principal") role = "principal";
    } else if (profileType === "Parent") {
      role = "parent";
    } else if (profileType === "NonAcademicStaff") {
      role = "accountant";
    } else if (profileType === "Student") {
      role = "student";
    }

    if (!username) return;

    const filters = [];
    if (email) filters.push({ email: email.toLowerCase() });
    if (username) filters.push({ username: username.trim() });
    if (profileType && record.id)
      filters.push({ profile_type: profileType, profile_id: record.id });

    const existing = await prisma.user.findFirst({
      where: { OR: filters },
    });

    const userData = {
      role,
      first_name: record.first_name || "",
      last_name: record.last_name || "",
      profile_type: profileType,
      profile_id: record.id,
    };
    if (email) userData.email = email.toLowerCase();
    if (username) userData.username = username.trim();
    if (record.custom_password) userData.password = record.custom_password;

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: userData,
      });
    } else {
      await prisma.user.create({
        data: userData,
      });
    }
  } catch (err) {
    // Fail quietly on duplicate syncs
  }
}

async function processRow(config, rawRow, idx) {
  try {
    const transformedData = toPrismaEnums(config.transform(rawRow));

    if (transformedData.id) {
      await prisma[config.modelName].upsert({
        where: { id: transformedData.id },
        update: transformedData,
        create: transformedData,
      });
    } else {
      await prisma[config.modelName].create({
        data: transformedData,
      });
    }

    if (config.syncUser) {
      await syncUserRecord(transformedData, config.fileName.split("_")[0]);
    }
    return { success: true };
  } catch (err) {
    logError(config.fileName, idx, rawRow.id, err.message, err.stack);
    return { success: false, error: err.message, row: idx + 2 };
  }
}

async function main() {
  console.log("🚀 Starting Fast Chunked Old Data CSV Migration...\n");
  const summary = {};

  for (const config of ENTITY_CONFIGS) {
    const filePath = path.join(OLD_DATA_DIR, config.fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`⏩ Skipping ${config.fileName} (file not found)`);
      summary[config.fileName] = { status: "Skipped (not found)", total: 0, processed: 0, errors: 0 };
      continue;
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      console.log(`⏩ Skipping ${config.fileName} (empty file)`);
      summary[config.fileName] = { status: "Skipped (empty file)", total: 0, processed: 0, errors: 0 };
      continue;
    }

    console.log(`📦 Processing ${config.fileName}...`);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const records = parseCSV(fileContent);

    if (records.length === 0) {
      console.log(`   ℹ️ No records found in ${config.fileName}`);
      summary[config.fileName] = { status: "Empty records", total: 0, processed: 0, errors: 0 };
      continue;
    }

    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        chunk.map((rawRow, offset) => processRow(config, rawRow, i + offset)),
      );

      for (const res of results) {
        if (res.success) inserted++;
        else errors++;
      }
    }

    summary[config.fileName] = { status: "Completed", total: records.length, processed: inserted, errors };
    console.log(
      `   ✅ Completed ${config.fileName}: ${inserted} processed, ${errors} errors.\n`,
    );
  }

  fs.writeFileSync(SUMMARY_LOG_PATH, JSON.stringify(summary, null, 2));
  console.log(`🎉 Migration finished! Summary saved to logs/import_summary.json`);
  console.log(`📄 Detailed error logs saved to logs/import_errors.log`);
}

main()
  .catch((e) => {
    console.error("💥 Critical migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
