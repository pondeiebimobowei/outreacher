const fs = require('fs');
let adapterTestPath = 'apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.spec.ts';
let adapterCode = fs.readFileSync(adapterTestPath, 'utf8');

const invalidSignatureTestOld = `    it('should throw AppValidationException if signature is invalid', () => {
      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('payload'),
          headers: {},
          secret: 'bad'
        });
      }).toThrow(new AppValidationException('Invalid webhook signature: Bad signature'));
    });`;

const invalidSignatureTestNew = `    it('should throw AppValidationException if signature is invalid', () => {
      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('payload'),
          headers: { 'svix-id': '1', 'svix-timestamp': '1', 'svix-signature': '1' },
          secret: 'bad'
        });
      }).toThrow(new AppValidationException('Invalid webhook signature: Bad signature'));
    });`;

adapterCode = adapterCode.replace(invalidSignatureTestOld, invalidSignatureTestNew);
fs.writeFileSync(adapterTestPath, adapterCode);
