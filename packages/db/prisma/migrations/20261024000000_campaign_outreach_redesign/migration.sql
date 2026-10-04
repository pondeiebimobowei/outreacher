-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'SUPPRESSED', 'FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MANUAL', 'TEMPLATE', 'AI');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SuppressionAction" AS ENUM ('SUPPRESSED', 'UNSUPPRESSED');

-- CreateEnum
CREATE TYPE "JobCancellationReason" AS ENUM ('PAUSED', 'SUPPRESSED', 'CANCELLED_BY_USER');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "OutreachStatus_new" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
ALTER TABLE "outreaches" ALTER COLUMN "status" TYPE "OutreachStatus_new" USING ("status"::text::"OutreachStatus_new");
ALTER TYPE "OutreachStatus" RENAME TO "OutreachStatus_old";
ALTER TYPE "OutreachStatus_new" RENAME TO "OutreachStatus";
DROP TYPE "public"."OutreachStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "PersonCompanyAssociation" DROP CONSTRAINT "PersonCompanyAssociation_company_id_fkey";

-- DropForeignKey
ALTER TABLE "PersonCompanyAssociation" DROP CONSTRAINT "PersonCompanyAssociation_person_id_fkey";

-- DropForeignKey
ALTER TABLE "PersonCompanyAssociation" DROP CONSTRAINT "PersonCompanyAssociation_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_person_selections" DROP CONSTRAINT "company_person_selections_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_person_selections" DROP CONSTRAINT "company_person_selections_person_id_fkey";

-- DropForeignKey
ALTER TABLE "company_person_selections" DROP CONSTRAINT "company_person_selections_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_campaign_member_id_fkey";

-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_workspace_id_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT "email_sends_workspace_id_sender_account_id_fkey";

-- DropForeignKey
ALTER TABLE "inbound_replies" DROP CONSTRAINT "inbound_replies_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "inbound_replies" DROP CONSTRAINT "inbound_replies_campaign_member_id_fkey";

-- DropForeignKey
ALTER TABLE "inbound_replies" DROP CONSTRAINT "inbound_replies_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_person_id_fkey";

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_selected_opportunity_id_fkey";

-- DropForeignKey
ALTER TABLE "members" DROP CONSTRAINT "members_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "outcomes" DROP CONSTRAINT "outcomes_campaign_member_id_fkey";

-- DropForeignKey
ALTER TABLE "outreaches" DROP CONSTRAINT "outreaches_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "outreaches" DROP CONSTRAINT "outreaches_person_company_association_id_fkey";

-- DropForeignKey
ALTER TABLE "outreaches" DROP CONSTRAINT "outreaches_sender_account_id_fkey";

-- DropForeignKey
ALTER TABLE "outreaches" DROP CONSTRAINT "outreaches_template_id_fkey";

-- DropForeignKey
ALTER TABLE "persons" DROP CONSTRAINT "persons_campaignId_fkey";

-- DropIndex
DROP INDEX "campaigns_workspace_id_company_id_idx";

-- DropIndex
DROP INDEX "campaigns_workspace_id_company_id_normalized_name_key";

-- DropIndex
DROP INDEX "email_sends_workspace_id_campaign_member_id_idx";

-- DropIndex
DROP INDEX "idempotency_records_workspace_id_key_key";

-- DropIndex
DROP INDEX "jobs_workspace_id_idempotency_key_key";

-- DropIndex
DROP INDEX "outcomes_workspace_id_campaign_member_id_idx";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "company_id",
DROP COLUMN "normalized_name",
DROP COLUMN "sender_account_id",
ADD COLUMN     "ai_prompt_context" TEXT,
ADD COLUMN     "content_source" "ContentSource" NOT NULL DEFAULT 'TEMPLATE',
ADD COLUMN     "max_follow_ups" INTEGER NOT NULL DEFAULT 2,
ALTER COLUMN "template_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "email_sends" DROP COLUMN "campaign_id",
DROP COLUMN "campaign_member_id",
ADD COLUMN     "expected_state_version" INTEGER,
ADD COLUMN     "first_provider_attempt_at" TIMESTAMP(3),
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "sender_account_id" SET NOT NULL,
ALTER COLUMN "outreach_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "email_templates" DROP COLUMN "body",
DROP COLUMN "subject",
ALTER COLUMN "is_archived" SET DEFAULT false;

-- AlterTable
ALTER TABLE "idempotency_records" DROP COLUMN "route",
ADD COLUMN     "operation" TEXT NOT NULL,
ADD COLUMN     "request_hash" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "response_status" DROP NOT NULL,
ALTER COLUMN "response_status" DROP DEFAULT,
ALTER COLUMN "response_body" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inbound_replies" DROP COLUMN "campaign_id",
DROP COLUMN "campaign_member_id";

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "cancellation_reason" "JobCancellationReason",
ALTER COLUMN "idempotency_key" SET NOT NULL;

-- AlterTable
ALTER TABLE "outcomes" DROP COLUMN "campaign_member_id",
ADD COLUMN     "outreach_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "outreaches" DROP COLUMN "campaign_id",
ADD COLUMN     "ai_prompt_context" TEXT,
ADD COLUMN     "ai_generation_status" "AiGenerationStatus",
ADD COLUMN     "campaign_recipient_id" TEXT,
ADD COLUMN     "content_source" "ContentSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "draft_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_follow_ups" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "outreach_reason" TEXT,
ALTER COLUMN "sender_account_id" DROP NOT NULL,
ALTER COLUMN "subject" SET DEFAULT '',
ALTER COLUMN "message" SET DEFAULT '',
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "persons" DROP COLUMN "campaignId";

-- AlterTable
ALTER TABLE "suppressions" DROP COLUMN "expires_at",
ADD COLUMN     "created_by_user_id" TEXT;

-- DropTable
DROP TABLE "PersonCompanyAssociation";

-- DropTable
DROP TABLE "company_person_selections";

-- DropTable
DROP TABLE "members";

-- DropEnum
DROP TYPE "CampaignMemberStatus";

-- CreateTable
CREATE TABLE "person_company_associations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "work_email" TEXT,
    "company_id" TEXT NOT NULL,
    "role" TEXT,
    "team" TEXT,
    "why_this_person" TEXT,
    "conversation_angle" TEXT,
    "conversation_state" "ConversationState" NOT NULL DEFAULT 'NO_REPLY',
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_company_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_template_steps" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "person_company_association_id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "target_role" TEXT,
    "selected_opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_history" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "action" "SuppressionAction" NOT NULL,
    "reason" "SuppressionReason" NOT NULL DEFAULT 'MANUAL',
    "source" TEXT,
    "notes" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_company_associations_workspace_id_conversation_state_idx" ON "person_company_associations"("workspace_id", "conversation_state");

-- CreateIndex
CREATE UNIQUE INDEX "person_company_associations_workspace_id_person_id_company__key" ON "person_company_associations"("workspace_id", "person_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_steps_template_id_sequence_key" ON "email_template_steps"("template_id", "sequence");

-- CreateIndex
CREATE INDEX "campaign_recipients_workspace_id_campaign_id_idx" ON "campaign_recipients"("workspace_id", "campaign_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_workspace_id_person_company_association_idx" ON "campaign_recipients"("workspace_id", "person_company_association_id");

-- CreateIndex
CREATE INDEX "campaign_recipients_workspace_id_status_idx" ON "campaign_recipients"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_workspace_id_campaign_id_person_company_key" ON "campaign_recipients"("workspace_id", "campaign_id", "person_company_association_id");

-- CreateIndex
CREATE INDEX "suppression_history_workspace_id_email_idx" ON "suppression_history"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspace_id_name_key" ON "campaigns"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "email_sends_outreach_id_sequence_key" ON "email_sends"("outreach_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_workspace_id_operation_key_key" ON "idempotency_records"("workspace_id", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_workspace_id_type_idempotency_key_key" ON "jobs"("workspace_id", "type", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_outreach_id_key" ON "outcomes"("outreach_id");

-- CreateIndex
CREATE INDEX "outcomes_workspace_id_outreach_id_idx" ON "outcomes"("workspace_id", "outreach_id");

-- CreateIndex
CREATE UNIQUE INDEX "outreaches_campaign_recipient_id_key" ON "outreaches"("campaign_recipient_id");

-- AddForeignKey
ALTER TABLE "person_company_associations" ADD CONSTRAINT "person_company_associations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_company_associations" ADD CONSTRAINT "person_company_associations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_company_associations" ADD CONSTRAINT "person_company_associations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_template_steps" ADD CONSTRAINT "email_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_person_company_association_id_fkey" FOREIGN KEY ("person_company_association_id") REFERENCES "person_company_associations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_selected_opportunity_id_fkey" FOREIGN KEY ("selected_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_person_company_association_id_fkey" FOREIGN KEY ("person_company_association_id") REFERENCES "person_company_associations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_campaign_recipient_id_fkey" FOREIGN KEY ("campaign_recipient_id") REFERENCES "campaign_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "sender_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "sender_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_history" ADD CONSTRAINT "suppression_history_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_history" ADD CONSTRAINT "suppression_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

