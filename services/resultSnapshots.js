import { toPrismaEnums } from "../utils/enumMapper.js";

function calculateGrade(score, section) {
  if (section === "Secondary") {
    if (score >= 75) return "A1";
    if (score >= 70) return "B2";
    if (score >= 65) return "B3";
    if (score >= 60) return "C4";
    if (score >= 55) return "C5";
    if (score >= 50) return "C6";
    if (score >= 45) return "D7";
    if (score >= 40) return "E8";
    return "F9";
  }
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

function calculateRemark(score, section) {
  if (section === "Secondary") {
    if (score >= 75) return "Excellent";
    if (score >= 70) return "Very Good";
    if (score >= 65) return "Good";
    if (score >= 50) return "Credit";
    if (score >= 40) return "Pass";
    return "Fail";
  }
  if (score >= 70) return "Excellent";
  if (score >= 60) return "Very Good";
  if (score >= 50) return "Good";
  if (score >= 45) return "Pass";
  if (score >= 40) return "Weak Pass";
  return "Fail";
}

function completeDerivedResultFields(result) {
  const components = [result.first_ca, result.second_ca, result.third_ca, result.exam_score];
  const hasScoreComponent = components.some((score) => score !== null && score !== undefined);
  const total = result.total ?? (hasScoreComponent
    ? components.reduce((sum, score) => sum + (Number(score) || 0), 0)
    : null);
  const resultWithTotal = { ...result, total };
  if (total === null) return resultWithTotal;
  return {
    ...resultWithTotal,
    grade: result.grade || calculateGrade(total, result.section),
    remark: result.remark || calculateRemark(total, result.section),
  };
}

export function hydrateResultRecord(result) {
  if (!result) return result;
  const components = [result.first_ca, result.second_ca, result.third_ca, result.exam_score];
  const hasScoreComponent = components.some((score) => score !== null && score !== undefined);
  const total = result.total ?? (hasScoreComponent
    ? components.reduce((sum, score) => sum + (Number(score) || 0), 0)
    : null);
  const next = { ...result, total };
  if (total === null) return next;
  return {
    ...next,
    grade: result.grade || calculateGrade(total, result.section),
    remark: result.remark || calculateRemark(total, result.section),
  };
}

export async function populateHistoricalResultMetadata(db) {
  const results = await db.result.findMany({
    orderBy: [{ class: "asc" }, { term: "asc" }, { session: "asc" }],
  });

  const groups = new Map();
  for (const result of results) {
    const key = `${result.class}|${result.term}|${result.session}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }

  for (const resultsForGroup of groups.values()) {
    const studentTotals = new Map();
    const studentSubjectTotals = new Map();
    const subjectGroups = new Map();
    for (const result of resultsForGroup) {
      const hydrated = hydrateResultRecord(result);
      studentTotals.set(hydrated.student_id, (studentTotals.get(hydrated.student_id) || 0) + (hydrated.total || 0));
      const subjectKey = `${hydrated.class}|${hydrated.subject_id}|${hydrated.term}|${hydrated.session}`;
      if (!subjectGroups.has(subjectKey)) subjectGroups.set(subjectKey, []);
      subjectGroups.get(subjectKey).push(hydrated);
      if (!studentSubjectTotals.has(hydrated.student_id)) studentSubjectTotals.set(hydrated.student_id, 0);
      studentSubjectTotals.set(hydrated.student_id, studentSubjectTotals.get(hydrated.student_id) + (hydrated.total || 0));
    }

    const classRoster = new Set(resultsForGroup.map((result) => result.student_id));
    const classRanking = [...classRoster].map((studentId) => ({ studentId, total: studentTotals.get(studentId) || 0 })).sort((a, b) => b.total - a.total);
    const classRankMap = new Map(classRanking.map((entry, index) => [entry.studentId, index + 1]));

    for (const [subjectKey, rows] of subjectGroups) {
      const subjectScores = [...rows].sort((a, b) => (b.total || 0) - (a.total || 0));
      const subjectRankMap = new Map(subjectScores.map((entry, index) => [entry.student_id, index + 1]));
      const avg = subjectScores.length ? Number((subjectScores.reduce((sum, entry) => sum + (entry.total || 0), 0) / subjectScores.length).toFixed(1)) : 0;
      for (const row of rows) {
        const studentId = row.student_id;
        const existing = await db.result.findUnique({ where: { id: row.id } });
        if (!existing) continue;
        const nextData = { 
          total: hydrateResultRecord(row).total,
          grade: row.grade || hydrateResultRecord(row).grade,
          remark: row.remark || hydrateResultRecord(row).remark,
          subject_position: row.subject_position ?? subjectRankMap.get(studentId) ?? null,
          class_average_score: row.class_average_score ?? avg,
          class_position: row.class_position ?? classRankMap.get(studentId) ?? null,
          total_in_class: row.total_in_class ?? classRoster.size,
          total_score_all_subjects: row.total_score_all_subjects ?? studentSubjectTotals.get(studentId) ?? null,
        };
        const updatePayload = Object.fromEntries(Object.entries(nextData).filter(([, value]) => value !== null && value !== undefined));
        if (Object.keys(updatePayload).length > 0) {
          await db.result.update({ where: { id: row.id }, data: updatePayload });
        }
      }
    }
  }

  const reportCards = await db.reportCard.findMany();
  for (const reportCard of reportCards) {
    const missingAverage = reportCard.average == null && reportCard.total_score != null && reportCard.total_students ? Number((reportCard.total_score / reportCard.total_students).toFixed(2)) : reportCard.average;
    const updatePayload = {};
    if (reportCard.total_score == null && reportCard.subjects_data) {
      const subjects = Array.isArray(reportCard.subjects_data) ? reportCard.subjects_data : Object.values(reportCard.subjects_data || {});
      const score = subjects.reduce((sum, item) => sum + (Number(item?.total || item?.score || 0) || 0), 0);
      updatePayload.total_score = Number(score.toFixed(2));
    }
    if (reportCard.average == null && missingAverage != null) updatePayload.average = missingAverage;
    if (reportCard.position == null && reportCard.total_students) updatePayload.position = 1;
    if (Object.keys(updatePayload).length > 0) {
      await db.reportCard.update({ where: { id: reportCard.id }, data: updatePayload });
    }
  }
}

export async function buildResultSnapshot(db, {
  studentId,
  admissionNumber,
  term,
  session,
  className,
  fallbackStudent,
  preferStoredSummary = false,
}) {
  const where = {
    term: toPrismaEnums(term),
    session,
    status: "Approved",
  };
  const studentRecord = studentId
    ? await db.student.findUnique({ where: { id: studentId } })
    : await db.student.findFirst({
      where: { admission_number: { equals: admissionNumber, mode: "insensitive" } },
    });
  const student = studentRecord || (fallbackStudent ? {
    id: fallbackStudent.id || studentId,
    first_name: fallbackStudent.first_name || String(fallbackStudent.student_name || "").split(" ")[0] || "",
    last_name: fallbackStudent.last_name || String(fallbackStudent.student_name || "").split(" ").slice(1).join(" "),
    admission_number: fallbackStudent.admission_number || admissionNumber || null,
    current_class: fallbackStudent.current_class || fallbackStudent.class || className || "",
    section: fallbackStudent.section || null,
  } : null);
  if (!student) return null;

  const resultClass = className || student.current_class;
  const allClassResults = (await db.result.findMany({
    where: { ...where, class: resultClass },
    orderBy: { subject_name: "asc" },
  })).map(completeDerivedResultFields);
  const studentResults = allClassResults
    .filter((result) => result.student_id === student.id)
    .map(completeDerivedResultFields);
  const roster = await db.student.findMany({
    where: { current_class: resultClass, status: "Active" },
    select: { id: true },
  });

  const totals = new Map();
  const subjectScores = new Map();
  for (const result of allClassResults) {
    const score = Number(result.total) || 0;
    totals.set(result.student_id, (totals.get(result.student_id) || 0) + score);
    if (!subjectScores.has(result.subject_id)) subjectScores.set(result.subject_id, []);
    subjectScores.get(result.subject_id).push({ studentId: result.student_id, score });
  }

  const sortedTotals = [...totals.entries()]
    .map(([id, total]) => ({ id, total }))
    .sort((a, b) => b.total - a.total);
  const calculatedClassPosition = sortedTotals.findIndex(({ id }) => id === student.id) + 1 || null;
  const classPosition = preferStoredSummary
    ? studentResults.find((result) => result.class_position !== null)?.class_position ?? calculatedClassPosition
    : calculatedClassPosition;
  const totalScore = studentResults.reduce((sum, result) => sum + (result.total || 0), 0);
  const totalSubjects = studentResults.length;
  const calculatedAverage = totalSubjects ? Number((totalScore / totalSubjects).toFixed(2)) : 0;
  const totalScoreSnapshot = preferStoredSummary
    ? studentResults.find((result) => result.total_score_all_subjects !== null)?.total_score_all_subjects ?? totalScore
    : totalScore;
  const average = totalSubjects ? Number((totalScoreSnapshot / totalSubjects).toFixed(2)) : 0;
  const totalInClass = preferStoredSummary
    ? studentResults.find((result) => result.total_in_class !== null)?.total_in_class ?? roster.length
    : roster.length;
  const subjectStats = new Map();

  for (const [subjectId, entries] of subjectScores) {
    const averageScore = Number((entries.reduce((sum, item) => sum + item.score, 0) / entries.length).toFixed(1));
    const ranked = [...entries].sort((a, b) => b.score - a.score);
    const calculatedPosition = ranked.findIndex((item) => item.studentId === student.id) + 1 || null;
    const storedPosition = studentResults.find((result) => result.subject_id === subjectId && result.subject_position !== null)?.subject_position;
    const storedAverage = studentResults.find((result) => result.subject_id === subjectId && result.class_average_score !== null)?.class_average_score;
    subjectStats.set(subjectId, {
      averageScore: preferStoredSummary ? storedAverage ?? averageScore : averageScore,
      position: preferStoredSummary ? storedPosition ?? calculatedPosition : calculatedPosition,
    });
  }

  const results = studentResults.map((result) => {
    const stats = subjectStats.get(result.subject_id);
    return {
      ...result,
      subject_position: stats?.position ?? result.subject_position ?? null,
      class_average_score: stats?.averageScore ?? result.class_average_score ?? null,
      class_position: classPosition ?? result.class_position ?? null,
      total_in_class: totalInClass,
      total_score_all_subjects: totalScoreSnapshot,
      total_subjects: totalSubjects,
      average: preferStoredSummary ? calculatedAverage : average,
    };
  });

  const termValue = toPrismaEnums(term);
  const [attendanceRecords, teacher, settings] = await Promise.all([
    db.attendance.findMany({
      where: {
        OR: [
          { student_id: student.id },
          ...(student.admission_number
            ? [{ admission_number: { equals: student.admission_number, mode: "insensitive" } }]
            : []),
        ],
        term: termValue,
        session,
      },
      orderBy: { date: "asc" },
    }),
    db.teacher.findFirst({
      where: {
        status: "Active",
        OR: [{ assigned_class: resultClass }, { form_teacher_class: resultClass }],
      },
    }),
    db.schoolSettings.findFirst(),
  ]);
  const present = attendanceRecords.filter((item) => item.status === "Present" || item.status === "Late").length;
  const attendanceSummary = {
    present,
    absent: attendanceRecords.filter((item) => item.status === "Absent").length,
    late: attendanceRecords.filter((item) => item.status === "Late").length,
    excused: attendanceRecords.filter((item) => item.status === "Excused").length,
    total: attendanceRecords.length,
    attendanceRate: attendanceRecords.length ? Math.round((present / attendanceRecords.length) * 100) : null,
  };

  return {
    student,
    results,
    classTeacher: teacher
      ? {
        name: `${teacher.first_name || ""} ${teacher.last_name || ""}`.trim(),
        phone: teacher.phone,
        email: teacher.email,
      }
      : null,
    rankings: {
      classPosition,
      totalInClass,
      totalScore: totalScoreSnapshot,
      totalSubjects,
      average,
      promoted: results[0]?.promotion_status === "Promoted",
    },
    attendanceSummary,
    settings,
  };
}
