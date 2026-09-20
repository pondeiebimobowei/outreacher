const fs = require('fs');

// 1. Fix inbound-reply.worker.ts
let worker = fs.readFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', 'utf8');
worker = worker.replace(
  "import { SECRET_RESOLVER_TOKEN, ISecretResolver }",
  "import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';\nimport type { ISecretResolver }"
);
worker = worker.replace(
  "import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN, IInboundEmailContentAdapterRegistry }",
  "import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';\nimport type { IInboundEmailContentAdapterRegistry }"
);
worker = worker.replace("async (tx)", "async (tx: any)");
worker = worker.replace("errorPayload: { message: err.message, stack: err.stack }", "payload: { ...((job.payload as any) || {}), error: err.message, stack: err.stack }");
fs.writeFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', worker);

// 2. Fix reply-correlation.service.ts
let correlator = fs.readFileSync('apps/api/src/modules/email/domain/reply-correlation.service.ts', 'utf8');
correlator = correlator.replace("import { InboundReply } from '@prisma/client';", "import { InboundReply } from '@outreacher/db';");
fs.writeFileSync('apps/api/src/modules/email/domain/reply-correlation.service.ts', correlator);

// 3. Fix resend-inbound-content.adapter.ts
let adapter = fs.readFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', 'utf8');
adapter = adapter.replace("public readonly code: InboundRetrievalErrorCode", "public readonly retrievalCode: InboundRetrievalErrorCode");
fs.writeFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', adapter);

// 4. Fix resend-inbound-email.adapter.ts
let inboundAdapter = fs.readFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.ts', 'utf8');
inboundAdapter = inboundAdapter.replace("wh.verify(context.rawBody.toString('utf8'), context.headers);", "wh.verify(context.rawBody.toString('utf8'), context.headers as Record<string, string>);");
fs.writeFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.ts', inboundAdapter);

// 5. Fix research repo
let researchRepo = fs.readFileSync('apps/api/src/modules/research/infrastructure/prisma-research.repository.ts', 'utf8');
researchRepo = researchRepo.replace(/'RESEARCH_COMPANY'/g, "'COMPANY_RESEARCH'");
fs.writeFileSync('apps/api/src/modules/research/infrastructure/prisma-research.repository.ts', researchRepo);

// 6. Fix research worker
let researchWorker = fs.readFileSync('apps/api/src/modules/research/worker/research.worker.ts', 'utf8');
researchWorker = researchWorker.replace(/'RESEARCH_COMPANY'/g, "'COMPANY_RESEARCH'");
fs.writeFileSync('apps/api/src/modules/research/worker/research.worker.ts', researchWorker);

