-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "outreach_id" TEXT,
ALTER COLUMN "campaign_id" DROP NOT NULL,
ALTER COLUMN "campaign_member_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inbound_replies" ADD COLUMN     "outreach_id" TEXT;

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_outreach_id_idx" ON "email_sends"("workspace_id", "outreach_id");

-- CreateIndex
CREATE INDEX "inbound_replies_workspace_id_outreach_id_idx" ON "inbound_replies"("workspace_id", "outreach_id");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add CHECK constraint to enforce outreach_id XOR campaign_member_id
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_source_xor" CHECK ((campaign_member_id IS NULL) <> (outreach_id IS NULL));
