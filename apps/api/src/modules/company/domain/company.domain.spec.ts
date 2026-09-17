import { AppValidationException } from '../../../common/errors/application.exception';
import {
  normalizeCompanyDomain,
  normalizeCompanyName,
  normalizeCompanyWebsiteUrl,
} from './company.domain';

describe('Company Domain Normalization', () => {
  describe('normalizeCompanyName', () => {
    it('normalizes simple company name with suffix', () => {
      expect(normalizeCompanyName('Acme Inc')).toBe('acme');
    });

    it('handles leading/trailing whitespace and multiple spaces', () => {
      expect(normalizeCompanyName('  Acme   Inc  ')).toBe('acme');
    });

    it('handles uppercase input', () => {
      expect(normalizeCompanyName('ACME CORPORATION')).toBe('acme');
    });

    it('strips periods in legal suffix', () => {
      expect(normalizeCompanyName('Acme Ltd.')).toBe('acme');
    });

    it('strips commas before legal suffix', () => {
      expect(normalizeCompanyName('Acme, Inc.')).toBe('acme');
    });

    it('strips word "Company"', () => {
      expect(normalizeCompanyName('Acme Company')).toBe('acme');
    });

    it('iteratively strips repeated legal suffixes', () => {
      expect(normalizeCompanyName('Acme Inc. Co.')).toBe('acme');
    });

    it('preserves core name without legal suffix', () => {
      expect(normalizeCompanyName('Stripe')).toBe('stripe');
    });

    it('throws AppValidationException if input normalizes to empty string', () => {
      expect(() => normalizeCompanyName('Inc')).toThrow(AppValidationException);
      expect(() => normalizeCompanyName('...')).toThrow(AppValidationException);
      expect(() => normalizeCompanyName('--- Ltd')).toThrow(
        AppValidationException,
      );
      expect(() => normalizeCompanyName('')).toThrow(AppValidationException);
    });
  });

  describe('normalizeCompanyWebsiteUrl', () => {
    it('returns null for undefined/null/empty url', () => {
      expect(normalizeCompanyWebsiteUrl(undefined)).toBeNull();
      expect(normalizeCompanyWebsiteUrl(null)).toBeNull();
      expect(normalizeCompanyWebsiteUrl('')).toBeNull();
      expect(normalizeCompanyWebsiteUrl('   ')).toBeNull();
    });

    it('prepends https:// when missing protocol', () => {
      expect(normalizeCompanyWebsiteUrl('www.acme.com')).toBe(
        'https://www.acme.com/',
      );
      expect(normalizeCompanyWebsiteUrl('acme.com')).toBe('https://acme.com/');
    });

    it('normalizes valid URL strings', () => {
      expect(normalizeCompanyWebsiteUrl('https://www.acme.com/path')).toBe(
        'https://www.acme.com/path',
      );
    });

    it('throws AppValidationException for invalid non-empty URL', () => {
      expect(() => normalizeCompanyWebsiteUrl('not-a-valid-url')).toThrow(
        AppValidationException,
      );
    });
  });

  describe('normalizeCompanyDomain', () => {
    it('returns null for undefined/null/empty', () => {
      expect(normalizeCompanyDomain(undefined)).toBeNull();
      expect(normalizeCompanyDomain(null)).toBeNull();
      expect(normalizeCompanyDomain('')).toBeNull();
    });

    it('extracts domain from full URL and strips www.', () => {
      expect(normalizeCompanyDomain('https://www.acme.com/')).toBe('acme.com');
      expect(normalizeCompanyDomain('http://www.acme.com/path')).toBe(
        'acme.com',
      );
      expect(normalizeCompanyDomain('www.acme.com')).toBe('acme.com');
      expect(normalizeCompanyDomain('ACME.COM')).toBe('acme.com');
    });

    it('retains subdomains like careers.acme.com', () => {
      expect(normalizeCompanyDomain('https://careers.acme.com')).toBe(
        'careers.acme.com',
      );
    });
  });
});
