-- CreateIndex
CREATE INDEX "email_sends_workspace_id_message_id_idx" ON "email_sends"("workspace_id", "message_id");
