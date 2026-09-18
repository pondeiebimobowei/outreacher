import { randomUUID } from 'crypto';

export class MessageIdGenerator {
  /**
   * Generates a globally unique, FQDN-compliant RFC 5322 Message-ID header value.
   * Format: <uuid@domain>
   */
  public static generate(domainOrFromEmail?: string): string {
    let domain = 'mail.outreacher.local';

    if (domainOrFromEmail && domainOrFromEmail.trim()) {
      const trimmed = domainOrFromEmail.trim().toLowerCase();
      if (trimmed.includes('@')) {
        const parts = trimmed.split('@');
        const extracted = parts[parts.length - 1];
        if (extracted && extracted.length > 0) {
          domain = extracted;
        }
      } else {
        domain = trimmed;
      }
    }

    const uniqueId = randomUUID();
    return `<${uniqueId}@${domain}>`;
  }
}
