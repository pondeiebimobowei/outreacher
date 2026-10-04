import {
  ContactDiscoveryResponseSchema,
  ContactIdentitySchema,
  PersonContactCandidateSchema,
  RoleAddressContactCandidateSchema,
  UuidV4Schema,
} from './transport-envelope.schema';

describe('Transport Envelope Schema (Zod Validation)', () => {
  const validUuidV4 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  describe('UuidV4Schema', () => {
    it('accepts valid UUID v4', () => {
      expect(UuidV4Schema.safeParse(validUuidV4).success).toBe(true);
    });

    it('rejects UUID v1, v3, v5 or arbitrary strings', () => {
      // UUID v1 (starts with timestamp, version digit is 1)
      expect(UuidV4Schema.safeParse('c9a646d0-2f10-11b2-8080-8005acf59200').success).toBe(false);
      expect(UuidV4Schema.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('Candidate Schemas', () => {
    it('validates a correct PERSON candidate with optional title', () => {
      const person = {
        person_kind: 'PERSON',
        first_name: 'Jane',
        last_name: 'Doe',
        title: 'VP of Engineering',
        email: 'jane@acme.com',
        confidence: 'HIGH',
        role_family: 'ENGINEERING',
        source: 'Website',
        source_url: 'https://acme.com/team',
        evidence: [
          {
            claim: 'Jane Doe is VP',
            source_name: 'Team',
            source_url: 'https://acme.com/team',
            source_excerpt: 'Jane Doe is VP of Engineering',
            classification: 'FACT',
            confidence: 'HIGH',
          },
        ],
      };
      expect(PersonContactCandidateSchema.safeParse(person).success).toBe(true);

      // Title null is valid
      const personNoTitle = { ...person, title: null };
      expect(PersonContactCandidateSchema.safeParse(personNoTitle).success).toBe(true);
    });

    it('validates a correct ROLE_ADDRESS candidate', () => {
      const role = {
        person_kind: 'ROLE_ADDRESS',
        first_name: null,
        last_name: null,
        title: 'Careers',
        email: 'careers@acme.com',
        confidence: 'HIGH',
        role_family: 'RECRUITING',
        source: 'Website',
        source_url: 'https://acme.com/jobs',
        evidence: [
          {
            claim: 'Careers email',
            source_name: 'Jobs',
            source_url: 'https://acme.com/jobs',
            source_excerpt: 'Email careers@acme.com',
            classification: 'FACT',
            confidence: 'HIGH',
          },
        ],
      };
      expect(RoleAddressContactCandidateSchema.safeParse(role).success).toBe(true);

      // Non-null names are rejected
      const invalidRole = { ...role, first_name: 'Jane' };
      expect(RoleAddressContactCandidateSchema.safeParse(invalidRole).success).toBe(false);
    });
  });

  describe('ContactDiscoveryResponseSchema Cross-Field Refinements', () => {
    const validPerson = {
      person_kind: 'PERSON',
      first_name: 'Jane',
      last_name: 'Doe',
      title: 'CTO',
      email: 'jane@acme.com',
      confidence: 'HIGH',
      role_family: 'LEADERSHIP',
      source: 'Website',
      source_url: 'https://acme.com/team',
      evidence: [
        {
          claim: 'Jane is CTO',
          source_name: 'Team',
          source_url: 'https://acme.com/team',
          source_excerpt: 'Jane is CTO',
          classification: 'FACT',
          confidence: 'HIGH',
        },
      ],
    };

    it('accepts valid COMPLETED response', () => {
      const res = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [validPerson],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(res).success).toBe(true);
    });

    it('rejects COMPLETED response if identity is not PRIMARY and CONFIDENT', () => {
      const resRelated = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'RELATED',
          confidence: 'CONFIDENT',
        },
        contacts: [validPerson],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resRelated).success).toBe(false);

      const resAmbiguous = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'AMBIGUOUS',
        },
        contacts: [validPerson],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resAmbiguous).success).toBe(false);
    });

    it('rejects COMPLETED response containing a failure object', () => {
      const res = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [validPerson],
        failure: {
          code: 'DISCOVERY_OPERATIONAL_FAILURE',
          retryable: false,
          message: 'Error',
        },
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(res).success).toBe(false);
    });

    it('accepts valid IDENTITY_HALTED response with empty contacts', () => {
      const res = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'IDENTITY_HALTED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'RELATED',
          confidence: 'AMBIGUOUS',
        },
        contacts: [],
        unknowns: ['identity_related_ambiguous'],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(res).success).toBe(true);
    });

    it('rejects IDENTITY_HALTED with contacts or with PRIMARY+CONFIDENT identity', () => {
      const resWithContacts = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'IDENTITY_HALTED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'UNRELATED',
          confidence: 'AMBIGUOUS',
        },
        contacts: [validPerson],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resWithContacts).success).toBe(false);

      const resConfident = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'IDENTITY_HALTED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resConfident).success).toBe(false);
    });

    it('accepts valid FAILED response with typed failure and permits PRIMARY+CONFIDENT identity', () => {
      const res = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'FAILED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [],
        failure: {
          code: 'DISCOVERY_TIMEOUT',
          retryable: true,
          message: 'Crawl timed out',
        },
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(res).success).toBe(true);
    });

    it('rejects FAILED response with contacts or missing failure', () => {
      const resWithContacts = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'FAILED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [validPerson],
        failure: {
          code: 'DISCOVERY_TIMEOUT',
          retryable: true,
          message: 'Crawl timed out',
        },
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resWithContacts).success).toBe(false);

      const resNoFailure = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'FAILED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [],
        unknowns: [],
      };
      expect(ContactDiscoveryResponseSchema.safeParse(resNoFailure).success).toBe(false);
    });
  });
});
