const fs = require('fs');
const path = 'apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.spec.ts';
let code = fs.readFileSync(path, 'utf8');

const parsePayloadStart = `  describe('parsePayload', () => {`;
const parsePayloadNew = `  describe('parsePayload', () => {
    it('should reject null JSON payload', () => {
      expect(() =>
        adapter.parsePayload(Buffer.from('null'), { 'svix-id': 'test' }),
      ).toThrow(AppValidationException);
    });

    it('should reject invalid created_at date', () => {
      const payload = {
        type: 'email.received',
        data: {
          email_id: 'e1',
          message_id: 'm1',
          from: 'a@b.com',
          to: 'c@d.com',
          created_at: 'invalid-date'
        }
      };
      expect(() =>
        adapter.parsePayload(Buffer.from(JSON.stringify(payload)), { 'svix-id': 'test' }),
      ).toThrow(AppValidationException);
    });
`;
code = code.replace(parsePayloadStart, parsePayloadNew);

fs.writeFileSync(path, code);
