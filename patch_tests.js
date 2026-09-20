const fs = require('fs');

// 1. E2E test
let e2ePath = 'apps/api/test/e2e/inbound-webhook.e2e-spec.ts';
let e2eCode = fs.readFileSync(e2ePath, 'utf8');

// Update the mock to throw on missing headers
const e2eMockOld = `      if (!headers['svix-id']) throw new Error('Missing svix-id header');
      if (secret === 'bad') throw new Error('Bad signature');`;
const e2eMockNew = `      if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
        throw new Error('Missing svix headers');
      }
      if (secret === 'bad') throw new Error('Bad signature');`;
e2eCode = e2eCode.replace(e2eMockOld, e2eMockNew);

// Adjust E2E validPayload to include all headers
const e2eValidRequest = `.set('svix-id', 'test-event-id')`;
const e2eValidRequestNew = `.set('svix-id', 'test-event-id')
      .set('svix-timestamp', '123')
      .set('svix-signature', 'sig')`;
e2eCode = e2eCode.replace(/\.set\('svix-id', 'test-event-id'\)/g, e2eValidRequestNew);

// Adjust test name
const e2eTestNameOld = `it('should reject webhook without svix headers'`;
const e2eTestNameNew = `it('should reject webhook when Svix verifier rejects due to missing headers'`;
e2eCode = e2eCode.replace(e2eTestNameOld, e2eTestNameNew);

fs.writeFileSync(e2ePath, e2eCode);

// 2. Adapter test
let adapterTestPath = 'apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.spec.ts';
let adapterCode = fs.readFileSync(adapterTestPath, 'utf8');

const adapterMockOld = `      if (secret === 'bad') throw new Error('Bad signature');`;
const adapterMockNew = `      if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
        throw new Error('Missing svix headers');
      }
      if (secret === 'bad') throw new Error('Bad signature');`;
adapterCode = adapterCode.replace(adapterMockOld, adapterMockNew);

// Update valid payload test to include headers
const adapterValidTest = `          headers: {},
          secret: 'good'`;
const adapterValidTestNew = `          headers: { 'svix-id': '1', 'svix-timestamp': '1', 'svix-signature': '1' },
          secret: 'good'`;
adapterCode = adapterCode.replace(adapterValidTest, adapterValidTestNew);

// Add missing headers test
const describeVerify = `  describe('verifySignature', () => {`;
const describeVerifyNew = `  describe('verifySignature', () => {
    it('should throw AppValidationException if svix headers are missing', () => {
      expect(() => {
        adapter.verifySignature({
          rawBody: Buffer.from('payload'),
          headers: { 'svix-id': '1' }, // Missing others
          secret: 'good'
        });
      }).toThrow(AppValidationException);
    });
`;
adapterCode = adapterCode.replace(describeVerify, describeVerifyNew);

fs.writeFileSync(adapterTestPath, adapterCode);

