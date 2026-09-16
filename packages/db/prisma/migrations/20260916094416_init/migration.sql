-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResearchRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('CONFIRMED', 'PROACTIVE', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('ACTIVE', 'CLOSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('PERSON', 'ROLE_ADDRESS');

-- CreateEnum
CREATE TYPE "EvidenceClassification" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignContactStatus" AS ENUM ('PENDING', 'READY', 'SCHEDULED', 'SENDING', 'SENT', 'FOLLOW_UP_DUE', 'REPLIED', 'COMPLETED', 'SUPPRESSED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailSendType" AS ENUM ('INITIAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "EmailSendStatus" AS ENUM ('PENDING', 'RESERVED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('USER_REQUEST', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINT', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('QUALIFIED_CONVERSATION', 'INTERESTED_NOT_QUALIFIED', 'REFERRAL', 'NOT_INTERESTED', 'REJECTED', 'NO_RESPONSE', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "target_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience_summary" TEXT,
    "portfolio_url" TEXT,
    "github_url" TEXT,
    "linkedin_url" TEXT,
    "website_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "career_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "website_url" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "linkedin_url" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_runs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "ResearchRunStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "provider" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "research_run_id" TEXT,
    "opportunity_type" "OpportunityType" NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'ACTIVE',
    "role_title" TEXT,
    "role_url" TEXT,
    "role_location" TEXT,
    "role_description" TEXT,
    "opening_source_url" TEXT,
    "opening_discovered_at" TIMESTAMP(3),
    "confidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_kind" "ContactKind" NOT NULL DEFAULT 'PERSON',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "title" TEXT,
    "source" TEXT,
    "source_url" TEXT,
    "confidence" TEXT,
    "discovered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "contact_id" TEXT,
    "research_run_id" TEXT,
    "claim" TEXT NOT NULL,
    "classification" "EvidenceClassification" NOT NULL DEFAULT 'UNKNOWN',
    "source_name" TEXT,
    "source_url" TEXT,
    "source_excerpt" TEXT,
    "collected_at" TIMESTAMP(3),
    "confidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "sending_identity" TEXT,
    "follow_up_delay_business_days" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_contacts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "CampaignContactStatus" NOT NULL DEFAULT 'PENDING',
    "target_role" TEXT,
    "outreach_reason" TEXT,
    "current_subject" TEXT,
    "current_body" TEXT,
    "selected_opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_contact_id" TEXT NOT NULL,
    "type" "EmailSendType" NOT NULL DEFAULT 'INITIAL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailSendStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3),
    "reserved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "message_id" TEXT,
    "provider" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email_send_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" "EmailEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL DEFAULT 'MANUAL',
    "source" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_contact_id" TEXT NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "type" "OutcomeType" NOT NULL,
    "notes" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "companies_workspace_id_idx" ON "companies"("workspace_id");

-- CreateIndex
CREATE INDEX "companies_workspace_id_status_idx" ON "companies"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "companies_workspace_id_normalized_name_key" ON "companies"("workspace_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "research_runs_workspace_id_idempotency_key_key" ON "research_runs"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "opportunities_workspace_id_company_id_idx" ON "opportunities"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "opportunities_workspace_id_status_idx" ON "opportunities"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_company_id_idx" ON "contacts"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_email_idx" ON "contacts"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_company_id_email_key" ON "contacts"("workspace_id", "company_id", "email");

-- CreateIndex
CREATE INDEX "evidence_workspace_id_company_id_idx" ON "evidence"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "evidence_workspace_id_opportunity_id_idx" ON "evidence"("workspace_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "evidence_workspace_id_contact_id_idx" ON "evidence"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_status_idx" ON "campaigns"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_company_id_idx" ON "campaigns"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_workspace_id_campaign_id_idx" ON "campaign_contacts"("workspace_id", "campaign_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_workspace_id_contact_id_idx" ON "campaign_contacts"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "campaign_contacts_workspace_id_status_idx" ON "campaign_contacts"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_contacts_workspace_id_campaign_id_contact_id_key" ON "campaign_contacts"("workspace_id", "campaign_id", "contact_id");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_campaign_contact_id_idx" ON "email_sends"("workspace_id", "campaign_contact_id");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_status_idx" ON "email_sends"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_scheduled_at_idx" ON "email_sends"("workspace_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "email_sends_provider_message_id_idx" ON "email_sends"("provider_message_id");

-- CreateIndex
CREATE INDEX "email_events_email_send_id_idx" ON "email_events"("email_send_id");

-- CreateIndex
CREATE INDEX "email_events_occurred_at_idx" ON "email_events"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_provider_provider_event_id_key" ON "email_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "suppressions_workspace_id_email_idx" ON "suppressions"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "suppressions_workspace_id_email_key" ON "suppressions"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "outcomes_workspace_id_campaign_contact_id_idx" ON "outcomes"("workspace_id", "campaign_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_workspace_id_name_key" ON "email_templates"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "jobs_workspace_id_status_available_at_idx" ON "jobs"("workspace_id", "status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_workspace_id_idempotency_key_key" ON "jobs"("workspace_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_profiles" ADD CONSTRAINT "career_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_research_run_id_fkey" FOREIGN KEY ("research_run_id") REFERENCES "research_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_selected_opportunity_id_fkey" FOREIGN KEY ("selected_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_send_id_fkey" FOREIGN KEY ("email_send_id") REFERENCES "email_sends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_campaign_contact_id_fkey" FOREIGN KEY ("campaign_contact_id") REFERENCES "campaign_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
