const fs = require('fs');
const path = 'docs/implementation-contracts.md';
let content = fs.readFileSync(path, 'utf8');

// Replace webhook endpoint and auth
content = content.replace(
  '### `POST /api/v1/webhooks/email/inbound`\n\n- **Purpose:** Receive inbound reply payload from email provider.\n- **Sync/Async:** **Asynchronous (`202 Accepted`)**.\n- **Authentication:** Webhook signature verification header (`X-Resend-Signature`).',
  '### `POST /api/v1/webhooks/email/inbound/:integrationId`\n\n- **Purpose:** Receive inbound reply payload from email provider.\n- **Sync/Async:** **Asynchronous (`202 Accepted`)**.\n- **Authentication:** Webhook signature verification header (e.g. `svix-id`, `svix-timestamp`, `svix-signature`).'
);

// Replace interface InboundEmailProviderAdapter
const oldInterface = `interface InboundEmailProviderAdapter {
  readonly provider: string; // e.g. "resend", "ses", "inbound-mx"
  verifyWebhook(request: InboundWebhookRequest): Promise<boolean>;
  parseWebhook(payload: unknown): Promise<NormalizedInboundEmail>;
}`;

const newInterface = `interface InboundEmailProviderAdapter {
  readonly provider: string;
  verifySignature(rawBody: Buffer, headers: Record<string, string>, secret: string): Promise<boolean>;
  parsePayload(rawBody: Buffer, headers: Record<string, string>): NormalizedInboundEmail;
}`;

content = content.replace(oldInterface, newInterface);

fs.writeFileSync(path, content);
