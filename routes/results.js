import { Router } from "express";
import prisma from "../config/prisma.js";
import { toUIEnums, toPrismaEnums } from "../utils/enumMapper.js";

const router = Router();

/**
 * POST /api/results/check
 * Public endpoint to check and retrieve a student's official result slip with PIN/token.
 */
router.post("/check", async (req, res) => {
  try {
    const { admissionNumber, admission_number, token, term, session } = req.body;
    const rawAdm = (admissionNumber || admission_number || "").toString().trim();
    const rawToken = (token || "").toString().trim();
    const rawTerm = (term || "").toString().trim();
    const rawSession = (session || "").toString().trim();

    if (!rawAdm || !rawToken || !rawTerm || !rawSession) {
      return res.status(400).json({ error: "Please fill in all fields (Admission Number, Token, Term, Session)." });
    }

    // 1. Find student by admission number (case-insensitive)
    const student = await prisma.student.findFirst({
      where: {
        admission_number: { equals: rawAdm, mode: "insensitive" },
      },
    });

    if (!student) {
      return res.status(404).json({ error: "Student with this admission number was not found." });
    }

    const prismaTerm = toPrismaEnums(rawTerm);

    // 2. Validate result token / PIN
    const tokenRecord = await prisma.resultToken.findFirst({
      where: {
        token: { equals: rawToken, mode: "insensitive" },
        OR: [
          { student_id: student.id },
          { admission_number: { equals: student.admission_number, mode: "insensitive" } },
        ],
        term: prismaTerm,
        session: rawSession,
      },
    });

    if (!tokenRecord) {
      return res.status(400).json({ error: "Invalid result token/PIN for this student, term, and session." });
    }

    if (tokenRecord.status === "Revoked" || tokenRecord.status === "Expired") {
      return res.status(400).json({
        error: `This token has been ${tokenRecord.status.toLowerCase()}. Please contact the school administration.`,
      });
    }

    // 3. Fetch approved results for this student
    const studentResults = await prisma.result.findMany({
      where: {
        student_id: student.id,
        term: prismaTerm,
        session: rawSession,
        status: "Approved",
      },
      orderBy: {
        subject_name: "asc",
      },
    });

    if (!studentResults || studentResults.length === 0) {
      return res.status(404).json({
        error: "No approved results found for this student in the selected term and session.",
      });
    }

    // 4. Compute class rankings and subject statistics efficiently server-side
    const studentClass = studentResults[0].class || student.current_class;
    const classPeers = await prisma.student.findMany({
      where: {
        current_class: studentClass,
        status: "Active",
      },
      select: { id: true },
    });
    const totalInClass = Math.max(classPeers.length, 1);

    const allClassResults = await prisma.result.findMany({
      where: {
        class: studentClass,
        term: prismaTerm,
        session: rawSession,
        status: "Approved",
      },
    });

    // Group scores by student to find class ranking
    const studentTotalsMap = {};
    const subjectScoresMap = {};

    for (const r of allClassResults) {
      // Accumulate student total
      studentTotalsMap[r.student_id] = (studentTotalsMap[r.student_id] || 0) + (r.total || 0);

      // Accumulate subject scores for subject averages and ranks
      if (!subjectScoresMap[r.subject_id]) {
        subjectScoresMap[r.subject_id] = [];
      }
      subjectScoresMap[r.subject_id].push({
        studentId: r.student_id,
        score: r.total || 0,
      });
    }

    // Sort peers for class position
    const sortedStudentTotals = Object.entries(studentTotalsMap)
      .map(([sId, tot]) => ({ studentId: sId, total: tot }))
      .sort((a, b) => b.total - a.total);

    const classPositionIdx = sortedStudentTotals.findIndex((s) => s.studentId === student.id);
    const classPosition = classPositionIdx >= 0 ? classPositionIdx + 1 : 1;

    // Calculate subject stats
    const subjectStats = {};
    for (const [subjId, entries] of Object.entries(subjectScoresMap)) {
      const sum = entries.reduce((acc, curr) => acc + curr.score, 0);
      const avg = entries.length ? parseFloat((sum / entries.length).toFixed(1)) : 0;
      const sortedEntries = [...entries].sort((a, b) => b.score - a.score);
      const ranks = {};
      sortedEntries.forEach((entry, idx) => {
        ranks[entry.studentId] = idx + 1;
      });
      subjectStats[subjId] = { avg, ranks };
    }

    const totalScore = studentResults.reduce((s, r) => s + (r.total || 0), 0);
    const enrichedResults = studentResults.map((r) => ({
      ...r,
      subject_position: subjectStats[r.subject_id]?.ranks[student.id] || r.subject_position || 1,
      class_average_score: subjectStats[r.subject_id]?.avg ?? r.class_average_score ?? 0,
      class_position: classPosition,
      total_in_class: totalInClass,
      total_score_all_subjects: totalScore,
    }));

    // 5. Fetch attendance summary for this student, term, and session
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        OR: [
          { student_id: student.id },
          { admission_number: { equals: student.admission_number, mode: "insensitive" } },
        ],
        term: prismaTerm,
        session: rawSession,
      },
      orderBy: { date: "asc" },
    });

    const presentCount = attendanceRecords.filter((a) => a.status === "Present" || a.status === "Late").length;
    const absentCount = attendanceRecords.filter((a) => a.status === "Absent").length;
    const lateCount = attendanceRecords.filter((a) => a.status === "Late").length;
    const excusedCount = attendanceRecords.filter((a) => a.status === "Excused").length;

    const attendanceSummary = {
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
      total: attendanceRecords.length,
      attendanceRate: attendanceRecords.length ? Math.round((presentCount / attendanceRecords.length) * 100) : null,
    };

    // 6. Fetch class teacher
    const teacher = await prisma.teacher.findFirst({
      where: {
        status: "Active",
        OR: [
          { assigned_class: studentClass },
          { form_teacher_class: studentClass },
        ],
      },
    });

    // 7. Fetch school settings
    const settings = await prisma.schoolSettings.findFirst();

    // 8. Mark token as Used if it was Active
    if (tokenRecord.status === "Active") {
      await prisma.resultToken.update({
        where: { id: tokenRecord.id },
        data: { status: "Used", is_used: true },
      });
    }

    return res.json(
      toUIEnums({
        student,
        results: enrichedResults,
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
          totalScore,
          promoted: studentResults[0]?.promotion_status === "Promoted",
        },
        attendanceSummary,
        settings,
      })
    );
  } catch (err) {
    console.error("[POST /api/results/check]", err);
    return res.status(500).json({ error: "An unexpected server error occurred: " + err.message });
  }
});

export default router;
