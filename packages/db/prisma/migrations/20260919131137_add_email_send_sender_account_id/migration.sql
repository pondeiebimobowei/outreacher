
-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_campaign_id_fkey";

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN "sender_account_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_id_key" ON "campaigns"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
