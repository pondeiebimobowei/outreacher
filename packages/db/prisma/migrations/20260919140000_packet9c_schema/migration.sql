
-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN "reply_to_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "email_sends_reply_to_token_key" ON "email_sends"("reply_to_token");

-- AlterTable
ALTER TABLE "email_sends" ADD COLUMN "retryable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "lease_version" INTEGER NOT NULL DEFAULT 0;
