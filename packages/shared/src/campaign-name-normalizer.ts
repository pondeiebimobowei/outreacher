// Eight explicitly enumerated dash/hyphen code points.
export const DASH_CHARS = '\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212';

// Fifteen explicitly enumerated whitespace code points.
// Does NOT use String.prototype.trim() (which covers a wider ECMAScript Unicode set).
export const WS_CHARS =
  '\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u2002\u2003\u2009\u200A\u202F\u205F\u3000\uFEFF';

const WS_LEAD_TRAIL = new RegExp(`^[${WS_CHARS}]+|[${WS_CHARS}]+$`, 'gu');
const WS_RUN = new RegExp(`[${WS_CHARS}]+`, 'gu');
const DASH_RE = new RegExp(`[${DASH_CHARS}]`, 'gu');

/**
 * Single authoritative campaign name normalizer.
 * Pipeline:
 * 1. Trim leading/trailing explicit whitespace code points
 * 2. Map all enumerated dash variants to em dash (\u2014)
 * 3. Collapse multiple explicit whitespace characters to a single space (\u0020)
 * 4. Lowercase via Unicode Default Case Conversion (String.prototype.toLowerCase)
 */
export function normalizeCampaignName(name: string): string {
  return name
    .replace(WS_LEAD_TRAIL, '') // step 1: explicit trim using WS set
    .replace(DASH_RE, '\u2014') // step 2: dash mapping
    .replace(WS_RUN, '\u0020') // step 3: whitespace collapse using WS set
    .toLowerCase(); // step 4: Unicode Default Case Conversion
}
