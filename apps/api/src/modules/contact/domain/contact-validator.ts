import { DiscoveredContactCandidate } from './contact.provider.interface';

export class ContactValidator {
  /**
   * Deterministically validates an email address.
   * Returns normalized email (trimmed, lowercase) if valid, or null if invalid or missing.
   */
  static normalizeEmail(rawEmail?: string | null): string | null {
    if (!rawEmail) return null;
    const trimmed = rawEmail.trim().toLowerCase();
    if (!trimmed) return null;

    // Simple RFC 5322 compatible regex for contact discovery validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  /**
   * Validates sourceUrl. Only accepts http:// or https:// URLs.
   */
  static validateSourceUrl(rawUrl?: string | null): string | null {
    if (!rawUrl) return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validates and normalizes candidate objects.
   */
  static sanitizeCandidate(
    candidate: DiscoveredContactCandidate,
  ): DiscoveredContactCandidate | null {
    const name = candidate.name?.trim();
    if (!name) return null;

    const email = this.normalizeEmail(candidate.email);
    const sourceUrl = this.validateSourceUrl(candidate.sourceUrl);
    const title = candidate.title?.trim() || undefined;

    return {
      name,
      title,
      email,
      contactKind:
        candidate.contactKind === 'ROLE_ADDRESS' ? 'ROLE_ADDRESS' : 'PERSON',
      source: candidate.source?.trim() || undefined,
      sourceUrl: sourceUrl || undefined,
      confidence: candidate.confidence || 'MEDIUM',
    };
  }

  /**
   * Deduplicates candidates by normalized email (when email is present),
   * or by normalized name + title (when email is missing).
   */
  static deduplicateCandidates(
    candidates: DiscoveredContactCandidate[],
  ): DiscoveredContactCandidate[] {
    const seenEmails = new Set<string>();
    const seenNameTitles = new Set<string>();
    const deduplicated: DiscoveredContactCandidate[] = [];

    for (const raw of candidates) {
      const sanitized = this.sanitizeCandidate(raw);
      if (!sanitized) continue;

      if (sanitized.email) {
        if (seenEmails.has(sanitized.email)) continue;
        seenEmails.add(sanitized.email);
        deduplicated.push(sanitized);
      } else {
        const key = `${sanitized.name.toLowerCase()}:${(sanitized.title || '').toLowerCase()}`;
        if (seenNameTitles.has(key)) continue;
        seenNameTitles.add(key);
        deduplicated.push(sanitized);
      }
    }

    return deduplicated;
  }
}
