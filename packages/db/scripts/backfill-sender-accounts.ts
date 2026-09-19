import { createPrismaClient } from '../src/client.js';
import { evaluateCampaigns, formatEvaluationTable } from '../src/sender-backfill.js';
import dotenv from 'dotenv';

dotenv.config();

export async function runBackfillDryRun() {
  const { prisma, pool } = createPrismaClient();
  try {
    console.log('Evaluating campaigns for Sender Account migration (DRY RUN ONLY - NO WRITES)...');
    const evaluations = await evaluateCampaigns(prisma);
    console.log('\n--- DRY RUN EVALUATION REPORT ---');
    console.log(formatEvaluationTable(evaluations));
    console.log('\nSummary:');
    const counts = evaluations.reduce((acc, curr) => {
      acc[curr.classification] = (acc[curr.classification] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(JSON.stringify(counts, null, 2));
    console.log('\nDRY RUN COMPLETE: Zero records created, updated, or deleted.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Only auto-run if directly executed via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillDryRun().catch((err) => {
    console.error('Dry run failed:', err);
    process.exit(1);
  });
}
