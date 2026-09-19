-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_campaign_id_fkey";

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN     "reply_to_token" TEXT,
ADD COLUMN     "retryable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sender_account_id" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "lease_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "email_sends_reply_to_token_key" ON "email_sends"("reply_to_token");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_sender_account_id_created_at_idx" ON "email_sends"("workspace_id", "sender_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_sender_account_id_fkey" FOREIGN KEY ("workspace_id", "sender_account_id") REFERENCES "sender_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

