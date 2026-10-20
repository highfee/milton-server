import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import prisma from "../config/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { toUIEnums, toPrismaEnums } from "../utils/enumMapper.js";
import { buildResultSnapshot } from "../services/resultSnapshots.js";

const router = Router();
const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function omitSnapshot(tokenRecord) {
  const { snapshot: _snapshot, ...publicToken } = tokenRecord;
  return publicToken;
}

function generateToken() {
  const token = [];
  for (let group = 0; group < 3; group++) {
    if (group) token.push("-");
    for (let digit = 0; digit < 4; digit++) {
      token.push(TOKEN_CHARS[randomInt(TOKEN_CHARS.length)]);
    }
  }
  return token.join("");
}

router.post("/tokens/generate", authenticate, authorize("admin", "accountant"), async (req, res) => {
  const term = String(req.body.term || "").trim();
  const session = String(req.body.session || "").trim();
  const className = String(req.body.class || "").trim();
  const studentId = String(req.body.student_id || "").trim();
  if (!term || !session || (!className && !studentId) || (className && studentId)) {
    return res.status(400).json({ error: "Provide a term, session, and exactly one class or student." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const students = studentId
        ? await tx.student.findMany({ where: { id: studentId, status: "Active" } })
        : await tx.student.findMany({ where: { current_class: className, status: "Active" } });
      if (studentId && students.length === 0) {
        return { error: "The selected active student could not be found.", status: 404 };
      }

      const createdTokens = [];
      let skipped = 0;
      for (const student of students) {
        const existing = await tx.resultToken.findFirst({
          where: { student_id: student.id, term: toPrismaEnums(term), session },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const snapshot = await buildResultSnapshot(tx, {
          studentId: student.id,
          term,
          session,
          className: student.current_class,
        });
        if (!snapshot?.results.length) {
          skipped++;
          continue;
        }

        const token = await tx.resultToken.create({
          data: {
            token: generateToken(),
            student_id: student.id,
            student_name: `${student.first_name || ""} ${student.last_name || ""}`.trim(),
            admission_number: student.admission_number,
            class: student.current_class,
            section: student.section,
            term: toPrismaEnums(term),
            session,
            generated_by: req.user?.profile_id || req.user?.id || null,
            generated_date: new Date().toISOString().slice(0, 10),
            status: "Active",
            snapshot,
          },
        });
        createdTokens.push(token);
      }

      return { tokens: createdTokens, created: createdTokens.length, skipped };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(201).json(toUIEnums({
      ...result,
      tokens: result.tokens.map(omitSnapshot),
    }));
  } catch (err) {
    if (err.code === "P2002" || err.code === "P2034") {
      return res.status(409).json({ error: "A result token was generated concurrently. Refresh the token list and try again." });
    }
    console.error("[POST /api/results/tokens/generate]", err);
    return res.status(500).json({ error: "Could not generate result tokens: " + err.message });
  }
});

/**
 * POST /api/results/check
 * Public endpoint to check and retrieve the immutable result snapshot stored with a token.
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

    const tokenRecord = await prisma.resultToken.findFirst({
      where: {
        token: { equals: rawToken, mode: "insensitive" },
        term: toPrismaEnums(rawTerm),
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

    let snapshot = tokenRecord.snapshot;
    if (snapshot) {
      if (String(snapshot.student?.admission_number || "").toLowerCase() !== rawAdm.toLowerCase()) {
        return res.status(400).json({ error: "Invalid result token/PIN for this student, term, and session." });
      }
    } else {
      const student = await prisma.student.findFirst({
        where: { admission_number: { equals: rawAdm, mode: "insensitive" } },
      });
      if (!student || (tokenRecord.student_id && tokenRecord.student_id !== student.id) ||
        (tokenRecord.admission_number && tokenRecord.admission_number.toLowerCase() !== rawAdm.toLowerCase())) {
        return res.status(400).json({ error: "Invalid result token/PIN for this student, term, and session." });
      }

      snapshot = await buildResultSnapshot(prisma, {
        studentId: student.id,
        admissionNumber: rawAdm,
        term: rawTerm,
        session: rawSession,
        className: tokenRecord.class || student.current_class,
      });
      if (!snapshot?.results.length) {
        return res.status(404).json({
          error: "No approved results found for this student in the selected term and session.",
        });
      }
      await prisma.resultToken.updateMany({
        where: { id: tokenRecord.id, snapshot: Prisma.DbNull },
        data: { snapshot },
      });
    }

    if (!snapshot.results?.length) {
      return res.status(404).json({
        error: "No approved results found for this student in the selected term and session.",
      });
    }
    if (tokenRecord.status === "Active") {
      await prisma.resultToken.update({
        where: { id: tokenRecord.id },
        data: { status: "Used", is_used: true },
      });
    }

    return res.json(toUIEnums(snapshot));
  } catch (err) {
    console.error("[POST /api/results/check]", err);
    return res.status(500).json({ error: "An unexpected server error occurred: " + err.message });
  }
});

export default router;
