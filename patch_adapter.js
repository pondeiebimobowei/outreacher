const fs = require('fs');
const path = 'apps/api/src/modules/email/infrastructure/resend-inbound-email.adapter.ts';
let code = fs.readFileSync(path, 'utf8');

const parseBlock = `
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new AppValidationException('Malformed JSON payload');
    }

    if (payload.type !== 'email.received') {
      throw new AppValidationException(\`Unsupported webhook event type: \${payload.type}\`);
    }

    const data = payload.data || payload;`;

const newParseBlock = `
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new AppValidationException('Malformed JSON payload');
    }

    if (!payload || typeof payload !== 'object') {
      throw new AppValidationException('Payload is not a valid JSON object');
    }

    if (payload.type !== 'email.received') {
      throw new AppValidationException(\`Unsupported webhook event type: \${payload.type}\`);
    }

    const data = payload.data || payload;
    if (!data || typeof data !== 'object') {
      throw new AppValidationException('Payload data is not a valid object');
    }`;

code = code.replace(parseBlock, newParseBlock);

const dateBlock = `      receivedAt: data.created_at ? new Date(data.created_at) : new Date(),`;
const newDateBlock = `      receivedAt: (() => {
        if (!data.created_at) return new Date();
        const d = new Date(data.created_at);
        if (isNaN(d.getTime())) throw new AppValidationException('Invalid created_at timestamp');
        return d;
      })(),`;

code = code.replace(dateBlock, newDateBlock);
fs.writeFileSync(path, code);
