-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "company_contact_selections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_contact_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_contact_selections_workspace_id_company_id_key" ON "company_contact_selections"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "company_contact_selections_workspace_id_company_id_idx" ON "company_contact_selections"("workspace_id", "company_id");

-- CreateIndex
CREATE INDEX "company_contact_selections_workspace_id_contact_id_idx" ON "company_contact_selections"("workspace_id", "contact_id");

-- AddForeignKey
ALTER TABLE "company_contact_selections" ADD CONSTRAINT "company_contact_selections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_selections" ADD CONSTRAINT "company_contact_selections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contact_selections" ADD CONSTRAINT "company_contact_selections_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
