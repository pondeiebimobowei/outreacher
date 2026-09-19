-- Migration B: enforce_campaign_normalized_name_unique
-- Pre-condition check: fail loudly if any unbackfilled rows exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "campaigns" WHERE "normalized_name" IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL on campaigns.normalized_name: unbackfilled rows exist. Run backfill script first.';
  END IF;
END $$;

-- Pre-condition check: fail loudly with colliding IDs if any duplicates exist
DO $$
DECLARE
  collision_record RECORD;
BEGIN
  SELECT "workspace_id", "company_id", "normalized_name", COUNT(*), string_agg("id"::text, ', ') as ids
  INTO collision_record
  FROM "campaigns"
  GROUP BY "workspace_id", "company_id", "normalized_name"
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot create unique constraint: duplicate normalized_name found for workspace %, company %, normalized_name "%". Colliding campaign IDs: %',
      collision_record.workspace_id,
      collision_record.company_id,
      collision_record.normalized_name,
      collision_record.ids;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "campaigns" ALTER COLUMN "normalized_name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_company_id_normalized_name_key" ON "campaigns"("workspace_id", "company_id", "normalized_name");
