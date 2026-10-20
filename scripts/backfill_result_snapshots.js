import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { buildResultSnapshot, populateHistoricalResultMetadata } from "../services/resultSnapshots.js";

async function backfillResultSnapshots() {
  await populateHistoricalResultMetadata(prisma);

  const tokens = await prisma.resultToken.findMany({
    where: { snapshot: Prisma.DbNull },
  });
  let backfilled = 0;
  let skipped = 0;

  for (const token of tokens) {
    if (!token.term || !token.session) {
      skipped++;
      continue;
    }
    const snapshot = await buildResultSnapshot(prisma, {
      studentId: token.student_id,
      admissionNumber: token.admission_number,
      term: token.term,
      session: token.session,
      className: token.class,
      fallbackStudent: token,
      preferStoredSummary: true,
    });
    if (!snapshot) {
      skipped++;
      continue;
    }
    const saved = await prisma.resultToken.updateMany({
      where: { id: token.id, snapshot: Prisma.DbNull },
      data: { snapshot },
    });
    backfilled += saved.count;
  }

  console.log(`Result snapshots backfilled: ${backfilled}; historical metadata normalized; skipped: ${skipped}.`);
}

backfillResultSnapshots()
  .catch((error) => {
    console.error("[Result snapshot backfill]", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
