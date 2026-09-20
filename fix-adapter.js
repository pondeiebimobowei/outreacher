const fs = require('fs');

let adapter = fs.readFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', 'utf8');

adapter = adapter.replace(
  "const headers = (data as any).headers || {};",
  `const rawHeaders = (data as any).headers || {};\n      const headers = Object.keys(rawHeaders).reduce((acc, key) => {\n        acc[key.toLowerCase()] = rawHeaders[key];\n        return acc;\n      }, {} as Record<string, any>);`
);

adapter = adapter.replace(
  "const inReplyTo = headers['In-Reply-To'] || null;",
  "const inReplyTo = headers['in-reply-to'] || null;"
);

adapter = adapter.replace(
  "const refHeader = headers['References'];",
  "const refHeader = headers['references'];"
);

fs.writeFileSync('apps/api/src/modules/email/infrastructure/resend-inbound-content.adapter.ts', adapter);
