const fs = require('fs');
let test = fs.readFileSync('apps/api/src/modules/email/application/inbound-reply.worker.spec.ts', 'utf8');

test = test.replace(
  "const exhaustedJob = { ...mockJob, attemptCount: 2 }; // max is 3, next attempt is 3",
  "const exhaustedJob = { ...mockJob, attemptCount: 3 }; // simulated RETURNING value after increment"
);

fs.writeFileSync('apps/api/src/modules/email/application/inbound-reply.worker.spec.ts', test);
