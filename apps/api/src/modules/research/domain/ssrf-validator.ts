export class SSRFValidator {
  private static PRIVATE_IP_PATTERNS = [
    /^127\./, // Loopback
    /^10\./, // Private 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private 172.16.0.0/12
    /^192\.168\./, // Private 192.168.0.0/16
    /^169\.254\./, // Link-local / Cloud Metadata (169.254.169.254)
    /^0\./,
    /^localhost$/i,
  ];

  /**
   * Validates target URL against SSRF rules:
   * - Must use http: or https: scheme.
   * - Hostname must not resolve to loopback, private CIDRs, or metadata endpoints.
   */
  static validateUrl(urlString: string): { valid: boolean; reason?: string } {
    if (!urlString || typeof urlString !== 'string') {
      return { valid: false, reason: 'URL string is required' };
    }

    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return { valid: false, reason: 'Invalid URL format' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        reason: 'Only HTTP and HTTPS protocols are allowed',
      };
    }

    const hostname = parsed.hostname;

    for (const pattern of this.PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, reason: `Blocked restricted host: ${hostname}` };
      }
    }

    return { valid: true };
  }
}
