import {
  getNullEmailCanonicalKey,
  normalizePersonName,
  normalizeRoleTitle,
} from './contact-normalizer';

describe('Contact Normalizer (TypeScript-Python Parity)', () => {
  describe('normalizePersonName', () => {
    it('normalizes diacritics, honorifics, apostrophes, and punctuation', () => {
      expect(normalizePersonName("Renée O'Connor")).toBe('renee oconnor');
      expect(normalizePersonName('Dr. Martin Luther King, Jr.')).toBe('martin luther king jr');
      expect(normalizePersonName('Müller-Lüdenscheidt')).toBe('muller ludenscheidt');
      expect(normalizePersonName("Prof. O'Neil")).toBe('oneil');
    });

    it('handles empty and null values safely', () => {
      expect(normalizePersonName(null)).toBe('');
      expect(normalizePersonName(undefined)).toBe('');
      expect(normalizePersonName('   ')).toBe('');
    });
  });

  describe('normalizeRoleTitle', () => {
    it('expands ampersands and replaces separators with space', () => {
      expect(
        normalizeRoleTitle('VP of Engineering & Technology / Infrastructure'),
      ).toBe('vp of engineering and technology infrastructure');
      expect(
        normalizeRoleTitle('Lead Software Engineer (Backend | Cloud)'),
      ).toBe('lead software engineer backend cloud');
      expect(
        normalizeRoleTitle('Senior Director - Talent Acquisition: EMEA'),
      ).toBe('senior director talent acquisition emea');
    });

    it('handles empty and null values safely', () => {
      expect(normalizeRoleTitle(null)).toBe('');
      expect(normalizeRoleTitle(undefined)).toBe('');
      expect(normalizeRoleTitle('   ')).toBe('');
    });
  });

  describe('getNullEmailCanonicalKey', () => {
    it('generates symmetric canonical composite keys', () => {
      expect(
        getNullEmailCanonicalKey("Renée", "O'Connor", "VP of Engineering & IT"),
      ).toBe('renee|oconnor|vp of engineering and it');

      expect(
        getNullEmailCanonicalKey("David", "Müller", "Head of Talent / Recruiting"),
      ).toBe('david|muller|head of talent recruiting');

      expect(
        getNullEmailCanonicalKey("Alice", null, null),
      ).toBe('alice||');
    });
  });
});
