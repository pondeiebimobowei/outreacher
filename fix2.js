const fs = require('fs');

let correlator = fs.readFileSync('apps/api/src/modules/email/domain/reply-correlation.service.ts', 'utf8');
correlator = correlator.replace("import { InboundReply } from '@outreacher/db';", "import { InboundReply } from '@repo/db';");
fs.writeFileSync('apps/api/src/modules/email/domain/reply-correlation.service.ts', correlator);

let adapter = fs.readFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', 'utf8');
adapter = adapter.replace("{ code, isRetryable }", "{ code: retrievalCode, isRetryable }");
fs.writeFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', adapter);

