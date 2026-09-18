-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "job_id" TEXT,
    "response_status" INTEGER NOT NULL DEFAULT 202,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_records_workspace_id_target_id_idx" ON "idempotency_records"("workspace_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_workspace_id_key_key" ON "idempotency_records"("workspace_id", "key");

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
