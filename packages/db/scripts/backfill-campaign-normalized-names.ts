import { createPrismaClient } from '../src/client.js';
import { normalizeCampaignName } from '@repo/shared';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Backfills normalized_name for all existing campaigns using the
 * authoritative TypeScript normalizer from @repo/shared and the
 * repository's configured PrismaPg driver adapter.
 *
 * Throws if any campaign fails to normalize so that finally cleanly
 * closes both PrismaClient and the pg.Pool.
 */
export async function backfillCampaignNormalizedNames() {
  const { prisma, pool } = createPrismaClient();
  try {
    const campaigns = await prisma.$queryRawUnsafe<
      { id: string; name: string }[]
    >('SELECT id, name FROM campaigns WHERE normalized_name IS NULL');

    console.log(`Backfilling normalized_name for ${campaigns.length} campaigns...`);

    for (const campaign of campaigns) {
      const normalizedName = normalizeCampaignName(campaign.name);
      if (!normalizedName) {
        throw new Error(
          `Campaign ${campaign.id} has name "${campaign.name}" which normalizes to empty string. Aborting backfill.`,
        );
      }
      await prisma.$executeRawUnsafe(
        'UPDATE campaigns SET normalized_name = $1 WHERE id = $2',
        normalizedName,
        campaign.id,
      );
    }

    console.log(`Backfill complete. ${campaigns.length} campaigns updated.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Only auto-run if directly executed via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillCampaignNormalizedNames().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
