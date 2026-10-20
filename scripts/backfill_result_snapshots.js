import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { buildResultSnapshot, populateHistoricalResultMetadata, repairResultSnapshot } from "../services/resultSnapshots.js";

async function backfillResultSnapshots() {
  await populateHistoricalResultMetadata(prisma);

  const tokens = await prisma.resultToken.findMany();
  let backfilled = 0;
  let skipped = 0;

  for (const token of tokens) {
    if (!token.term || !token.session) {
      skipped++;
      continue;
    }
    const snapshot = token.snapshot
      ? await repairResultSnapshot(prisma, token, token.snapshot)
      : await buildResultSnapshot(prisma, {
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
      where: { id: token.id },
      data: { snapshot },
    });
    backfilled += saved.count;
  }

  console.log(`Result snapshots repaired: ${backfilled}; historical metadata normalized; skipped: ${skipped}.`);
}

backfillResultSnapshots()
  .catch((error) => {
    console.error("[Result snapshot backfill]", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
