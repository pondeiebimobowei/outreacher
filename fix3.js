const fs = require('fs');

let worker = fs.readFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', 'utf8');
worker = worker.replace(
  `          data: {
            status: newStatus,
            failedAt: new Date(),
            updatedAt: new Date(),
            availableAt,
            lastError: err.message
          }
          }
        });`,
  `          data: {
            status: newStatus,
            failedAt: newStatus === 'DEAD_LETTER' ? new Date() : null,
            updatedAt: new Date(),
            availableAt,
            lastError: err.message
          }
        });`
);
fs.writeFileSync('apps/api/src/modules/email/application/inbound-reply.worker.ts', worker);
