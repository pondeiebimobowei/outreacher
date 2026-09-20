const fs = require('fs');

// Update walkthrough
const wPath = '/Users/user/.gemini/antigravity/brain/a03a7346-d94d-462a-a852-f44615d1f31b/walkthrough.md';
let wContent = fs.readFileSync(wPath, 'utf8');
wContent += `
## 10B Follow-ups

- Reconciled existing JobType/String contract drift in Prisma by creating a \`JobType\` enum. Data backfilled for \`RESEARCH_COMPANY\` -> \`COMPANY_RESEARCH\` and other values safely.
- Fixed Prisma unique constraint idempotency deduplication handling for ` + "`err.message`" + ` catching the correct index name.
- Upgraded the E2E tests:
  - Removed the \`$transaction\` mock; it now runs the true transaction on a test DB.
  - Asserted valid 202 requests persist 1 \`InboundReply\`, 1 \`Job(WEBHOOK_PROCESSING)\`, and 1 \`IdempotencyRecord\`.
  - Asserted subsequent identical requests return 202 and suppress duplication (records remain at 1).
  - Added negative path tests where invalid signatures and missing headers assert 400 and prove 0 records persisted.
`;
fs.writeFileSync(wPath, wContent);

// Update task
const tPath = '/Users/user/.gemini/antigravity/brain/a03a7346-d94d-462a-a852-f44615d1f31b/task.md';
let tContent = fs.readFileSync(tPath, 'utf8');
tContent = tContent.replace('- [ ] Unmock the E2E test database transaction', '- [x] Unmock the E2E test database transaction');
tContent = tContent.replace('- [ ] Implement DB persistence assertions', '- [x] Implement DB persistence assertions');
tContent = tContent.replace('- [ ] Implement invalid signature assertions', '- [x] Implement invalid signature assertions');
tContent = tContent.replace('- [ ] Write migration SQL to fix `RESEARCH_COMPANY` data', '- [x] Write migration SQL to fix `RESEARCH_COMPANY` data');
fs.writeFileSync(tPath, tContent);
