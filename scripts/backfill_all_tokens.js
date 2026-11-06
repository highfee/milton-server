import { PrismaClient } from '@prisma/client';
import { repairResultSnapshot } from '../services/resultSnapshots.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting token repair and backfill...');
  const tokens = await prisma.resultToken.findMany();
  console.log(`Found ${tokens.length} tokens to inspect.`);

  let updatedCount = 0;
  for (const token of tokens) {
    try {
      const repaired = await repairResultSnapshot(prisma, token, token.snapshot);
      const newClass = repaired?.student?.current_class || token.class;

      const needsUpdate =
        JSON.stringify(repaired) !== JSON.stringify(token.snapshot) ||
        newClass !== token.class;

      if (needsUpdate) {
        await prisma.resultToken.update({
          where: { id: token.id },
          data: {
            snapshot: repaired,
            class: newClass,
          },
        });
        updatedCount++;
        console.log(`Updated token ${token.token} for ${token.student_name}: class was "${token.class}", now "${newClass}"`);
      }
    } catch (err) {
      console.error(`Error repairing token ${token.token}:`, err.message);
    }
  }

  console.log(`Backfill complete. Successfully updated ${updatedCount} tokens.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
