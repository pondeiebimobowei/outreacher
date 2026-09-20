const fs = require('fs');

let worker = fs.readFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', 'utf8');

// 1. Fix recovery
worker = worker.replace(
  "data: {\n          status: 'PENDING'\n        }",
  "data: {\n          status: 'PENDING',\n          leaseVersion: { increment: 1 }\n        }"
);

// 2. Fix claim query
worker = worker.replace(
  "UPDATE jobs\n      SET \n        status = 'RUNNING',\n        \"leaseVersion\" = \"leaseVersion\" + 1,\n        \"updated_at\" = NOW()",
  "UPDATE jobs\n      SET \n        status = 'RUNNING',\n        \"leaseVersion\" = \"leaseVersion\" + 1,\n        \"attempt_count\" = \"attempt_count\" + 1,\n        \"started_at\" = NOW(),\n        \"updated_at\" = NOW()"
);
worker = worker.replace(
  "WHERE type = 'WEBHOOK_PROCESSING'\n          AND status = 'PENDING'",
  "WHERE type = 'WEBHOOK_PROCESSING'\n          AND status = 'PENDING'\n          AND (available_at IS NULL OR available_at <= NOW())"
);

// 3. Fix processJob payload integrationId
worker = worker.replace(
  "const payload = job.payload as { inboundReplyId: string };",
  "const payload = job.payload as { inboundReplyId: string; integrationId?: string };"
);

worker = worker.replace(
  "// Load integration\n      const integration = await this.prisma.integration.findFirst({\n        where: {\n          workspaceId: inboundReply.workspaceId,\n          provider: inboundReply.provider as any\n        }\n      });\n\n      if (!integration || !integration.webhookSecretReference) {\n        throw new Error(`Integration for provider ${inboundReply.provider} not found or missing webhook secret`);\n      }",
  `// Load integration
      let integration;
      if (payload.integrationId) {
        integration = await this.prisma.integration.findUnique({
          where: { id: payload.integrationId }
        });
      } else {
        integration = await this.prisma.integration.findFirst({
          where: {
            workspaceId: inboundReply.workspaceId,
            provider: inboundReply.provider as any
          }
        });
      }

      if (!integration || !integration.secretReference) {
        throw new Error(\`Integration not found or missing provider secret\`);
      }`
);

// 4. Remove webhook secret resolution
worker = worker.replace(
  /\/\/ Resolve credentials\s+const credentials = await this\.secretResolver\.resolve\([\s\S]*?\/\/\s*Wait,\s*is it the standard API key\? \n/,
  ""
);

// 5. Update completedAt
worker = worker.replace(
  "data: { status: 'COMPLETED', updatedAt: new Date() }",
  "data: { status: 'COMPLETED', updatedAt: new Date(), completedAt: new Date() }"
);

// 6. Update Error handling
worker = worker.replace(
  /const attempts = job\.attemptCount \+ 1;[\s\S]*?payload: { \.\.\.\(\(job\.payload as any\) \|\| {}\), error: err\.message, stack: err\.stack }/g,
  `const attempts = job.attemptCount;
      const maxAttempts = job.maxAttempts;
      
      const newStatus = (!isRetryable || attempts >= maxAttempts) ? 'DEAD_LETTER' : 'PENDING';
      const availableAt = newStatus === 'PENDING' 
        ? new Date(Date.now() + Math.pow(2, attempts) * 1000)
        : job.availableAt;

      try {
        await this.prisma.job.update({
          where: { id: job.id, leaseVersion: job.leaseVersion },
          data: {
            status: newStatus,
            failedAt: new Date(),
            updatedAt: new Date(),
            availableAt,
            lastError: err.message
          }`
);

fs.writeFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', worker);
