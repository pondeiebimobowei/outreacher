
-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('RESEND', 'SES', 'SMTP');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INVALID_CREDENTIALS', 'DISABLED');

-- CreateEnum
CREATE TYPE "SenderStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "secret_reference" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to" TEXT,
    "status" "SenderStatus" NOT NULL DEFAULT 'ACTIVE',
    "daily_limit" INTEGER NOT NULL DEFAULT 50,
    "sending_window" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_sender_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "sender_account_id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_sender_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integrations_workspace_id_status_idx" ON "integrations"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspace_id_name_key" ON "integrations"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspace_id_id_key" ON "integrations"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "sender_accounts_workspace_id_integration_id_idx" ON "sender_accounts"("workspace_id", "integration_id");

-- CreateIndex
CREATE INDEX "sender_accounts_workspace_id_status_idx" ON "sender_accounts"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sender_accounts_workspace_id_from_email_key" ON "sender_accounts"("workspace_id", "from_email");

-- CreateIndex
CREATE UNIQUE INDEX "sender_accounts_workspace_id_id_key" ON "sender_accounts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "campaign_sender_accounts_workspace_id_campaign_id_idx" ON "campaign_sender_accounts"("workspace_id", "campaign_id");

-- CreateIndex
CREATE INDEX "campaign_sender_accounts_workspace_id_sender_account_id_idx" ON "campaign_sender_accounts"("workspace_id", "sender_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_sender_accounts_campaign_id_sender_account_id_key" ON "campaign_sender_accounts"("campaign_id", "sender_account_id");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_sender_account_id_created_at_idx" ON "email_sends"("workspace_id", "sender_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_sender_account_id_fkey" FOREIGN KEY ("workspace_id", "sender_account_id") REFERENCES "sender_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_workspace_id_integration_id_fkey" FOREIGN KEY ("workspace_id", "integration_id") REFERENCES "integrations"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_sender_accounts" ADD CONSTRAINT "campaign_sender_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_sender_accounts" ADD CONSTRAINT "campaign_sender_accounts_workspace_id_campaign_id_fkey" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "campaigns"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_sender_accounts" ADD CONSTRAINT "campaign_sender_accounts_workspace_id_sender_account_id_fkey" FOREIGN KEY ("workspace_id", "sender_account_id") REFERENCES "sender_accounts"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
