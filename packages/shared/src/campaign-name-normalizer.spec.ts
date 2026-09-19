import {
  normalizeCampaignName,
  DASH_CHARS,
  WS_CHARS,
} from './campaign-name-normalizer';

describe('normalizeCampaignName (Authoritative Normalizer)', () => {
  describe('Authoritative Test Vectors (§5)', () => {
    const vectors: [string, string, string][] = [
      ['Outreach — Acme', 'outreach — acme', 'ASCII baseline'],
      ['Outreach – Acme', 'outreach — acme', 'EN DASH → EM DASH'],
      ['Outreach - Acme', 'outreach — acme', 'HYPHEN-MINUS → EM DASH'],
      ['Outreach −  Acme', 'outreach — acme', 'MINUS SIGN + double space'],
      ['  outreach — acme  ', 'outreach — acme', 'Leading/trailing whitespace'],
      ['OUTREACH — ACME', 'outreach — acme', 'ASCII uppercase'],
      ['Outreach —  Acme   Corp', 'outreach — acme corp', 'Internal whitespace collapse'],
      ['Outreach ‑ Acme', 'outreach — acme', 'NON-BREAKING HYPHEN (U+2011)'],
      ['Outreach — São Paulo', 'outreach — são paulo', 'Latin-Extended: ã'],
      ['Outreach — Müller GmbH', 'outreach — müller gmbh', 'Latin-Extended: ü'],
      ['Outreach — Société Générale', 'outreach — société générale', 'Latin-Extended: é'],
      ['Outreach — ÅNGSTRÖM AB', 'outreach — ångström ab', 'Latin-Extended: Å→å'],
    ];

    test.each(vectors)(
      'normalizes %s to %s (%s)',
      (input, expected, _description) => {
        expect(normalizeCampaignName(input)).toBe(expected);
      },
    );
  });

  describe('Idempotency', () => {
    it('is idempotent for any input', () => {
      const inputs = [
        'Outreach — Acme',
        '  Outreach ––  Acme Corp   ',
        'Outreach — Société Générale',
        'Outreach - 123 456',
      ];
      for (const input of inputs) {
        const firstPass = normalizeCampaignName(input);
        const secondPass = normalizeCampaignName(firstPass);
        expect(secondPass).toBe(firstPass);
      }
    });
  });

  describe('Explicit Whitespace Set (WS_CHARS)', () => {
    it('contains exactly 15 whitespace code points', () => {
      // Decode into code point array
      const codePoints = Array.from(WS_CHARS).map((c) => c.codePointAt(0)!);
      expect(codePoints.length).toBe(15);
      expect(codePoints).toEqual([
        0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x2002,
        0x2003, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000, 0xfeff,
      ]);
    });

    it('trims each whitespace character individually', () => {
      for (const char of Array.from(WS_CHARS)) {
        const input = `${char}Outreach — Acme${char}`;
        expect(normalizeCampaignName(input)).toBe('outreach — acme');
      }
    });

    it('collapses runs of mixed whitespace characters to a single ASCII space', () => {
      const mixedWs = Array.from(WS_CHARS).join('');
      const input = `Outreach${mixedWs}Acme`;
      expect(normalizeCampaignName(input)).toBe('outreach acme');
    });

    it('returns empty string when input consists solely of whitespace characters', () => {
      const allWs = Array.from(WS_CHARS).join('');
      expect(normalizeCampaignName(allWs)).toBe('');
      expect(normalizeCampaignName('   ')).toBe('');
      expect(normalizeCampaignName('\t\r\n')).toBe('');
      expect(normalizeCampaignName('\u2003\u3000\uFEFF')).toBe('');
    });
  });

  describe('Dash mapping', () => {
    it('contains exactly 8 dash code points', () => {
      const codePoints = Array.from(DASH_CHARS).map((c) => c.codePointAt(0)!);
      expect(codePoints.length).toBe(8);
      expect(codePoints).toEqual([
        0x002d, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212,
      ]);
    });

    it('maps all 8 dash characters to EM DASH (U+2014)', () => {
      for (const char of Array.from(DASH_CHARS)) {
        const input = `A${char}B`;
        expect(normalizeCampaignName(input)).toBe('a—b');
      }
    });
  });
});
