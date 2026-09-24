/*
  Warnings:

  - You are about to drop the column `sending_identity` on the `campaigns` table. All the data in the column will be lost.
  - You are about to drop the column `campaign_contact_id` on the `email_sends` table. All the data in the column will be lost.
  - You are about to drop the column `contact_id` on the `evidence` table. All the data in the column will be lost.
  - You are about to drop the column `campaign_contact_id` on the `inbound_replies` table. All the data in the column will be lost.
  - You are about to drop the column `campaign_contact_id` on the `outcomes` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `campaign_contacts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `company_contact_selections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contacts` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `sender_account_id` to the `campaigns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `template_id` to the `campaigns` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaign_member_id` to the `email_sends` table without a default value. This is not possible if the table is not empty.
  - Added the required column `is_archived` to the `email_templates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_association_id` to the `evidence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaign_member_id` to the `outcomes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `first_name` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last_name` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "PersonKind" AS ENUM ('PERSON', 'ROLE_ADDRESS');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignMemberStatus" AS ENUM ('PENDING', 'READY', 'SCHEDULED', 'SENDING', 'SENT', 'FOLLOW_UP_DUE', 'REPLIED', 'COMPLETED', 'SUPPRESSED', 'FAILED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "campaign_contacts" DROP CONSTRAINT IF EXISTS "campaign_contacts_campaign_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_contacts" DROP CONSTRAINT IF EXISTS "campaign_contacts_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_contacts" DROP CONSTRAINT IF EXISTS "campaign_contacts_selected_opportunity_id_fkey";

-- DropForeignKey
ALTER TABLE "campaign_contacts" DROP CONSTRAINT IF EXISTS "campaign_contacts_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "company_contact_selections" DROP CONSTRAINT IF EXISTS "company_contact_selections_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_contact_selections" DROP CONSTRAINT IF EXISTS "company_contact_selections_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "company_contact_selections" DROP CONSTRAINT IF EXISTS "company_contact_selections_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_company_id_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_campaign_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "evidence" DROP CONSTRAINT IF EXISTS "evidence_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "inbound_replies" DROP CONSTRAINT IF EXISTS "inbound_replies_campaign_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "outcomes" DROP CONSTRAINT IF EXISTS "outcomes_campaign_contact_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "email_sends_workspace_id_campaign_contact_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "evidence_workspace_id_contact_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "outcomes_workspace_id_campaign_contact_id_idx";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "sending_identity",
ADD COLUMN     "sender_account_id" TEXT NOT NULL,
ADD COLUMN     "template_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "career_profiles" ADD COLUMN     "background_and_positioning" TEXT,
ADD COLUMN     "career_goals" TEXT,
ADD COLUMN     "current_role" TEXT,
ADD COLUMN     "years_experience" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "phone_number" TEXT;

-- AlterTable
ALTER TABLE "email_sends" DROP COLUMN "campaign_contact_id",
ADD COLUMN     "campaign_member_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "is_archived" BOOLEAN NOT NULL;

-- AlterTable
ALTER TABLE "evidence" DROP COLUMN "contact_id",
ADD COLUMN     "company_association_id" TEXT NOT NULL,
ADD COLUMN     "person_id" TEXT;

-- AlterTable
ALTER TABLE "inbound_replies" DROP COLUMN "campaign_contact_id",
ADD COLUMN     "campaign_member_id" TEXT;

-- AlterTable
ALTER TABLE "outcomes" DROP COLUMN "campaign_contact_id",
ADD COLUMN     "campaign_member_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "name",
ADD COLUMN     "first_name" TEXT NOT NULL DEFAULT 'User',
ADD COLUMN     "last_name" TEXT NOT NULL DEFAULT '';

ALTER TABLE "users" ALTER COLUMN "first_name" DROP DEFAULT,
ALTER COLUMN "last_name" DROP DEFAULT;

-- DropTable
DROP TABLE IF EXISTS "campaign_contacts";

-- DropTable
DROP TABLE IF EXISTS "company_contact_selections";

-- DropTable
DROP TABLE IF EXISTS "contacts";

-- DropEnum
DROP TYPE IF EXISTS "CampaignContactStatus";

-- DropEnum
DROP TYPE IF EXISTS "ContactKind";

-- CreateTable
CREATE TABLE "outreaches" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_company_association_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "template_id" TEXT,
    "sender_account_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "OutreachStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "outreach_id" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_kind" "PersonKind" NOT NULL DEFAULT 'PERSON',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "website_url" TEXT,
    "linkedin_url" TEXT,
    "title" TEXT,
    "source" TEXT,
    "note" TEXT,
    "source_url" TEXT,
    "confidence" TEXT,
    "discovered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonCompanyAssociation" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "work_email" TEXT,
    "company_id" TEXT NOT NULL,
    "role" TEXT,
    "team" TEXT,
    "why_this_person" TEXT,
    "conversation_angle" TEXT,

    CONSTRAINT "PersonCompanyAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_person_selections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_person_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" "CampaignMemberStatus" NOT NULL DEFAULT 'PENDING',
    "target_role" TEXT,
    "outreach_reason" TEXT,
    "current_subject" TEXT,
    "current_body" TEXT,
    "selected_opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreaches_workspace_id_idx" ON "outreaches"("workspace_id");

-- CreateIndex
CREATE INDEX "outreaches_person_company_association_id_idx" ON "outreaches"("person_company_association_id");

-- CreateIndex
CREATE INDEX "outreaches_workspace_id_status_idx" ON "outreaches"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "conversation_messages_workspace_id_idx" ON "conversation_messages"("workspace_id");

-- CreateIndex
CREATE INDEX "conversation_messages_outreach_id_idx" ON "conversation_messages"("outreach_id");

-- CreateIndex
CREATE INDEX "persons_workspace_id_idx" ON "persons"("workspace_id");

-- CreateIndex
CREATE INDEX "persons_workspace_id_email_idx" ON "persons"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "persons_workspace_id_email_key" ON "persons"("workspace_id", "email");

-- CreateIndex
CREATE INDEX "company_person_selections_workspace_id_company_id_idx" ON "company_person_selections"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "company_person_selections_workspace_id_person_id_idx" ON "company_person_selections"("workspace_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_person_selections_workspace_id_company_id_key" ON "company_person_selections"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "members_workspace_id_campaign_id_idx" ON "members"("workspace_id", "campaign_id");

-- CreateIndex
CREATE INDEX "members_workspace_id_person_id_idx" ON "members"("workspace_id", "person_id");

-- CreateIndex
CREATE INDEX "members_workspace_id_status_idx" ON "members"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "members_workspace_id_campaign_id_person_id_key" ON "members"("workspace_id", "campaign_id", "person_id");

-- CreateIndex
CREATE INDEX "email_sends_workspace_id_campaign_member_id_idx" ON "email_sends"("workspace_id", "campaign_member_id");

-- CreateIndex
CREATE INDEX "evidence_workspace_id_person_id_idx" ON "evidence"("workspace_id", "person_id");

-- CreateIndex
CREATE INDEX "outcomes_workspace_id_campaign_member_id_idx" ON "outcomes"("workspace_id", "campaign_member_id");

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_person_company_association_id_fkey" FOREIGN KEY ("person_company_association_id") REFERENCES "PersonCompanyAssociation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreaches" ADD CONSTRAINT "outreaches_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "sender_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_outreach_id_fkey" FOREIGN KEY ("outreach_id") REFERENCES "outreaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCompanyAssociation" ADD CONSTRAINT "PersonCompanyAssociation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCompanyAssociation" ADD CONSTRAINT "PersonCompanyAssociation_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCompanyAssociation" ADD CONSTRAINT "PersonCompanyAssociation_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_person_selections" ADD CONSTRAINT "company_person_selections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_person_selections" ADD CONSTRAINT "company_person_selections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_person_selections" ADD CONSTRAINT "company_person_selections_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_selected_opportunity_id_fkey" FOREIGN KEY ("selected_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_member_id_fkey" FOREIGN KEY ("campaign_member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_campaign_member_id_fkey" FOREIGN KEY ("campaign_member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_replies" ADD CONSTRAINT "inbound_replies_campaign_member_id_fkey" FOREIGN KEY ("campaign_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
