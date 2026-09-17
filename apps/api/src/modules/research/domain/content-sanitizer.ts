export class ContentSanitizer {
  /**
   * Normalizes raw external HTML or text by stripping dangerous script/style tags,
   * removing control characters, and escaping prompt delimiters.
   */
  static sanitize(input: string): string {
    if (!input) return '';

    // Strip script and style blocks including content
    let cleaned = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

    // Strip HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');

    // Normalize whitespace & strip non-printable ASCII control characters (except newlines/tabs)
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Neutralize prompt injection delimiters or system override phrases
    cleaned = cleaned.replace(
      /###\s*(SYSTEM|INSTRUCTIONS|USER|ASSISTANT)/gi,
      '[REDACTED_HEADER]',
    );

    return cleaned.replace(/\s+/g, ' ').trim();
  }

  /**
   * Encloses untrusted data inside strict, unambiguous prompt delimiters.
   */
  static wrapUntrustedContext(content: string): string {
    const sanitized = this.sanitize(content);
    return `\n### RETRIEVED UNTRUSTED DATA\n${sanitized}\n### END RETRIEVED UNTRUSTED DATA\n`;
  }
}
