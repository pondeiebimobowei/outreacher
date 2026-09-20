const fs = require('fs');

let test = fs.readFileSync('apps/api/src/modules/email/application/inbound-reply.worker.spec.ts', 'utf8');

// The worker no longer updates attemptCount on error (it's already incremented on claim). 
// The mocks return job with attemptCount: 1, maxAttempts: 3.
test = test.replace(
  "attemptCount: 1",
  "attemptCount: 1"
);

test = test.replace(
  "expect(prismaMock.job.update).toHaveBeenCalledWith({\n      where: { id: 'job-1', leaseVersion: 1 },\n      data: expect.objectContaining({ status: 'PENDING', attemptCount: 1 })\n    });",
  "expect(prismaMock.job.update).toHaveBeenCalledWith({\n      where: { id: 'job-1', leaseVersion: 1 },\n      data: expect.objectContaining({ status: 'PENDING', lastError: expect.any(String) })\n    });"
);

test = test.replace(
  "expect(prismaMock.job.update).toHaveBeenCalledWith({\n      where: { id: 'job-1', leaseVersion: 1 },\n      data: expect.objectContaining({ status: 'DEAD_LETTER', attemptCount: 3 })\n    });",
  "expect(prismaMock.job.update).toHaveBeenCalledWith({\n      where: { id: 'job-1', leaseVersion: 1 },\n      data: expect.objectContaining({ status: 'DEAD_LETTER', lastError: expect.any(String) })\n    });"
);

test = test.replace(
  /webhookSecretReference/g,
  "secretReference"
);

fs.writeFileSync('apps/api/src/modules/email/application/inbound-reply.worker.spec.ts', test);
