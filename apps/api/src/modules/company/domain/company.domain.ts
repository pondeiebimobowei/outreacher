import { AppValidationException } from '../../../common/errors/application.exception';

/**
 * Domain error raised when a unique constraint on (workspaceId, normalizedName) is violated.
 * Carries workspaceId and normalizedName to allow upper application layers to retrieve
 * the existing record ID for 409 conflict payload building.
 */
export class CompanyDuplicateNameError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly normalizedName: string,
  ) {
    super(
      `Company with normalized name "${normalizedName}" already exists in workspace "${workspaceId}".`,
    );
    this.name = 'CompanyDuplicateNameError';
  }
}

/**
 * Normalizes a user-supplied company name for canonical workspace identity.
 *
 * Rules:
 * 1. Trim leading/trailing whitespace and collapse multiple internal spaces to a single space.
 * 2. Convert to lowercase.
 * 3. Strip punctuation (commas, periods, quotes, dashes, hyphens, etc.).
 * 4. Iteratively strip corporate legal suffixes at word boundaries (inc, llc, corp, corporation, ltd, limited, co, company).
 * 5. Re-trim result.
 * 6. Throw AppValidationException if result is empty string.
 */
export function normalizeCompanyName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new AppValidationException(
      'Company name must be a non-empty string.',
    );
  }

  // Step 1: Collapse multiple spaces & trim
  let normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();

  // Step 2 & 3: Strip punctuation (punctuation marks like commas, periods, quotes, dashes)
  normalized = normalized.replace(/[,.'"'\-–—]/g, '');

  // Step 4: Iteratively strip legal suffixes from word boundaries until clean
  const suffixRegex = /\b(inc|llc|corp|corporation|ltd|limited|co|company)\b/g;
  let previous = '';
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(suffixRegex, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Step 5 & 6: Final check for non-empty normalized identity
  if (!normalized) {
    throw new AppValidationException(
      'Company name does not contain a valid unique identity after normalization.',
    );
  }

  return normalized;
}

/**
 * Validates and formats a website URL.
 *
 * Behavior:
 * - Omitted / null / empty string -> returns null
 * - Invalid URL string -> throws AppValidationException
 * - Valid URL string -> returns normalized URL (ensuring protocol)
 */
export function normalizeCompanyWebsiteUrl(url?: string | null): string | null {
  if (url === undefined || url === null) {
    return null;
  }

  const trimmed = url.trim();
  if (trimmed === '') {
    return null;
  }

  let urlWithProtocol = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    urlWithProtocol = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(urlWithProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      throw new AppValidationException(`Invalid website URL format: "${url}".`);
    }
    return parsed.href;
  } catch (err) {
    if (err instanceof AppValidationException) {
      throw err;
    }
    throw new AppValidationException(`Invalid website URL format: "${url}".`);
  }
}

/**
 * Extracts normalized domain hostname from a URL or domain string.
 *
 * Behavior:
 * - Omitted / null / empty string -> returns null
 * - Strips protocol, port, path, query, hash, and leading "www."
 * - Lowercases hostname
 * - Retains specific subdomains (e.g. "careers.acme.com")
 */
export function normalizeCompanyDomain(
  urlOrDomain?: string | null,
): string | null {
  if (urlOrDomain === undefined || urlOrDomain === null) {
    return null;
  }

  const trimmed = urlOrDomain.trim();
  if (trimmed === '') {
    return null;
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    if (!hostname || !hostname.includes('.')) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}
