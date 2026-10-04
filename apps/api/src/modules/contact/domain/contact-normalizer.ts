/**
 * Canonical normalization functions guaranteeing exact cross-language parity
 * between NestJS (TypeScript) and Python contact discovery engines.
 */

export function normalizePersonName(name?: string | null): string {
  if (!name || !name.trim()) return '';
  // 1. Unicode NFD diacritics removal
  let text = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // 2. Lowercase
  text = text.toLowerCase();
  // 3. Strip honorific prefixes
  text = text.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '');
  // 4. Strip apostrophes without space
  text = text.replace(/['’]/g, '');
  // 5. Non-alphanumeric to space
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  // 6. Collapse whitespace and trim
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeRoleTitle(title?: string | null): string {
  if (!title || !title.trim()) return '';
  // 1. Unicode NFD diacritics removal
  let text = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // 2. Lowercase
  text = text.toLowerCase();
  // 3. Expand & to and
  text = text.replace(/&/g, ' and ');
  // 4. Replace punctuation/separators with space
  text = text.replace(/[,/|+\-:\;.\(\)\[\]\{\}\\_]/g, ' ');
  // 5. Non-alphanumeric to space
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  // 6. Collapse whitespace and trim
  return text.replace(/\s+/g, ' ').trim();
}

export function getNullEmailCanonicalKey(
  firstName?: string | null,
  lastName?: string | null,
  title?: string | null,
): string {
  return `${normalizePersonName(firstName)}|${normalizePersonName(lastName)}|${normalizeRoleTitle(title)}`;
}
