import { ContactValidator } from './contact-validator';

describe('ContactValidator', () => {
  describe('normalizeEmail', () => {
    it('normalizes valid uppercase emails', () => {
      expect(ContactValidator.normalizeEmail('  Jane.Doe@Acme.COM ')).toBe(
        'jane.doe@acme.com',
      );
    });

    it('returns null for malformed emails', () => {
      expect(ContactValidator.normalizeEmail('not-an-email')).toBeNull();
      expect(ContactValidator.normalizeEmail('jane@com')).toBeNull();
      expect(ContactValidator.normalizeEmail('')).toBeNull();
      expect(ContactValidator.normalizeEmail(null)).toBeNull();
    });
  });

  describe('validateSourceUrl', () => {
    it('validates http and https URLs', () => {
      expect(
        ContactValidator.validateSourceUrl('https://example.com/team'),
      ).toBe('https://example.com/team');
      expect(
        ContactValidator.validateSourceUrl('http://example.com/about'),
      ).toBe('http://example.com/about');
    });

    it('rejects unsafe URL schemes', () => {
      expect(
        ContactValidator.validateSourceUrl('javascript:alert(1)'),
      ).toBeNull();
      expect(
        ContactValidator.validateSourceUrl('file:///etc/passwd'),
      ).toBeNull();
      expect(
        ContactValidator.validateSourceUrl('data:text/html,test'),
      ).toBeNull();
      expect(ContactValidator.validateSourceUrl('invalid-url')).toBeNull();
    });
  });

  describe('deduplicateCandidates', () => {
    it('deduplicates by email and by name+title when email is null', () => {
      const input = [
        {
          firstName: 'Jane',
          lastName: 'Doe',
          title: 'VP Engineering',
          email: 'Jane@Acme.com',
          personKind: 'PERSON' as const,
          confidence: 'HIGH' as const,
          source: 'PUBLIC_WEB',
          sourceUrl: 'https://example.com/team',
        },
        {
          firstName: 'Jane',
          lastName: 'Doe Duplicate',
          title: 'VP Engineering',
          email: 'jane@acme.com', // duplicate email
          personKind: 'PERSON' as const,
          confidence: 'HIGH' as const,
          source: 'PUBLIC_WEB',
          sourceUrl: 'https://example.com/team',
        },
        {
          firstName: 'John',
          lastName: 'Smith',
          title: 'Recruiter',
          email: null,
          personKind: 'PERSON' as const,
          confidence: 'MEDIUM' as const,
          source: 'PUBLIC_WEB',
          sourceUrl: 'https://example.com/team',
        },
        {
          firstName: 'John',
          lastName: 'Smith',
          title: 'Recruiter',
          email: null, // duplicate name+title without email
          personKind: 'PERSON' as const,
          confidence: 'MEDIUM' as const,
          source: 'PUBLIC_WEB',
          sourceUrl: 'https://example.com/team',
        },
        {
          firstName: null,
          lastName: null,
          title: 'Support',
          email: 'careers@acme.com',
          personKind: 'ROLE_ADDRESS' as const,
          confidence: 'HIGH' as const,
          source: 'PUBLIC_WEB',
          sourceUrl: 'https://example.com/team',
        },
      ];

      const result = ContactValidator.deduplicateCandidates(input);
      expect(result).toHaveLength(3);
      expect(result[0].email).toBe('jane@acme.com');
      expect(result[1].email).toBeNull();
      expect(result[2].personKind).toBe('ROLE_ADDRESS');
    });
  });
});
