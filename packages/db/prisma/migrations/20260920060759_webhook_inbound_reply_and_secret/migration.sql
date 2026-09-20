-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('UNCORRELATED', 'CORRELATED', 'AMBIGUOUS');

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "webhook_secret_reference" TEXT;

-- CreateTable
CREATE TABLE "inbound_replies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "campaign_contact_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'RESEND',
    "provider_event_id" TEXT NOT NULL,
    "provider_email_id" TEXT,
    "message_id" TEXT,
    "in_reply_to" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply_to_token" TEXT,
    "from_name" TEXT,
    "from_email" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "status" "ReplyStatus" NOT NULL DEFAULT 'UNCORRELATED',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_replies_workspace_id_idx" ON "inbound_replies"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_replies_workspace_id_provider_provider_event_id_key" ON "inbound_replies"("workspace_id", "provider", "provider_event_id");

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
