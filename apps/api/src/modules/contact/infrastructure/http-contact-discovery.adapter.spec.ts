import { ConfigService } from '@nestjs/config';
import { HttpContactDiscoveryAdapter } from './http-contact-discovery.adapter';
import { ContactDiscoveryProviderException } from '../domain/contact-provider.exception';

describe('HttpContactDiscoveryAdapter', () => {
  let adapter: HttpContactDiscoveryAdapter;
  let configService: ConfigService;

  const validUuidV4 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'RESEARCH_ENGINE_URL') return 'http://127.0.0.1:8000';
        if (key === 'CONTACT_PROVIDER_TIMEOUT_MS') return 30000;
        return undefined;
      }),
    } as unknown as ConfigService;

    adapter = new HttpContactDiscoveryAdapter(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Pre-network Input Validation', () => {
    it('halts immediately when neither websiteUrl nor domain is provided (0 network calls)', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.status).toBe('PARTIAL');
      expect(result.errorCode).toBe('IDENTITY_UNRESOLVED');
      expect(result.candidates).toEqual([]);
    });

    it('halts immediately when websiteUrl and domain conflict (0 network calls)', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        websiteUrl: 'https://acme.com',
        domain: 'other-company.org',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.status).toBe('PARTIAL');
      expect(result.errorCode).toBe('IDENTITY_AMBIGUOUS');
      expect(result.candidates).toEqual([]);
    });
  });

  describe('Domain Pinning Validation', () => {
    it('rejects provider response when verified domain differs from requested canonical domain', async () => {
      const mockEnvelope = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'hijacked-domain.com', // differs from requested acme.com
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [],
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      await expect(
        adapter.discoverContacts({
          companyId: 'comp-1',
          workspaceId: 'ws-1',
          companyName: 'Acme Corp',
          domain: 'acme.com',
        }),
      ).rejects.toThrow(ContactDiscoveryProviderException);
    });
  });

  describe('Python FAILED Response Routing', () => {
    it('converts retryable FAILED envelope into ContactDiscoveryProviderException (retryable=true)', async () => {
      const mockEnvelope = {
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
          message: 'Upstream crawl timed out',
        },
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      try {
        await adapter.discoverContacts({
          companyId: 'comp-1',
          workspaceId: 'ws-1',
          companyName: 'Acme Corp',
          domain: 'acme.com',
        });
        fail('Should have thrown ContactDiscoveryProviderException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ContactDiscoveryProviderException);
        expect(err.code).toBe('DISCOVERY_TIMEOUT');
        expect(err.retryable).toBe(true);
        expect(err.message).toBe('Upstream crawl timed out');
      }
    });

    it('converts non-retryable FAILED envelope into ContactDiscoveryProviderException (retryable=false)', async () => {
      const mockEnvelope = {
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
          code: 'DISCOVERY_OPERATIONAL_FAILURE',
          retryable: false,
          message: 'Fatal operational error',
        },
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      try {
        await adapter.discoverContacts({
          companyId: 'comp-1',
          workspaceId: 'ws-1',
          companyName: 'Acme Corp',
          domain: 'acme.com',
        });
        fail('Should have thrown ContactDiscoveryProviderException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ContactDiscoveryProviderException);
        expect(err.code).toBe('DISCOVERY_OPERATIONAL_FAILURE');
        expect(err.retryable).toBe(false);
      }
    });
  });

  describe('Semantic Validation on Contacts', () => {
    it('rejects ROLE_ADDRESS with unallowed mailbox', async () => {
      const mockEnvelope = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [
          {
            person_kind: 'ROLE_ADDRESS',
            first_name: null,
            last_name: null,
            title: 'Billing',
            email: 'billing@acme.com', // Not in allowed set
            confidence: 'HIGH',
            role_family: 'GENERAL',
            source: 'Website',
            source_url: 'https://acme.com/billing',
            evidence: [
              {
                claim: 'Billing email',
                source_name: 'Page',
                source_url: 'https://acme.com/billing',
                source_excerpt: 'Contact billing@acme.com',
                classification: 'FACT',
                confidence: 'HIGH',
              },
            ],
          },
        ],
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      await expect(
        adapter.discoverContacts({
          companyId: 'comp-1',
          workspaceId: 'ws-1',
          companyName: 'Acme Corp',
          domain: 'acme.com',
        }),
      ).rejects.toThrow(ContactDiscoveryProviderException);
    });

    it('rejects candidate with external email domain', async () => {
      const mockEnvelope = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [
          {
            person_kind: 'PERSON',
            first_name: 'Jane',
            last_name: 'Doe',
            title: 'VP',
            email: 'jane@external-consultant.com', // Violates corporate domain rule
            confidence: 'HIGH',
            role_family: 'LEADERSHIP',
            source: 'Website',
            source_url: 'https://acme.com/team',
            evidence: [
              {
                claim: 'Jane Doe is VP',
                source_name: 'Team',
                source_url: 'https://acme.com/team',
                source_excerpt: 'Jane Doe is VP',
                classification: 'FACT',
                confidence: 'HIGH',
              },
            ],
          },
        ],
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      await expect(
        adapter.discoverContacts({
          companyId: 'comp-1',
          workspaceId: 'ws-1',
          companyName: 'Acme Corp',
          domain: 'acme.com',
        }),
      ).rejects.toThrow(ContactDiscoveryProviderException);
    });
  });

  describe('Successful Envelope Processing', () => {
    it('returns mapped candidates on valid COMPLETED response', async () => {
      const mockEnvelope = {
        contract_version: '1.0',
        discovery_run_id: validUuidV4,
        status: 'COMPLETED',
        identity: {
          verified_domain: 'acme.com',
          primary_relationship: 'PRIMARY',
          confidence: 'CONFIDENT',
        },
        contacts: [
          {
            person_kind: 'PERSON',
            first_name: 'Alice',
            last_name: 'Smith',
            title: 'Head of Talent',
            email: 'alice@acme.com',
            confidence: 'HIGH',
            role_family: 'RECRUITING',
            source: 'Website',
            source_url: 'https://acme.com/team',
            evidence: [
              {
                claim: 'Alice Smith is Head of Talent',
                source_name: 'Team Page',
                source_url: 'https://acme.com/team',
                source_excerpt: 'Alice Smith leads talent as Head of Talent',
                classification: 'FACT',
                confidence: 'HIGH',
              },
            ],
          },
        ],
        unknowns: [],
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      const result = await adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].firstName).toBe('Alice');
      expect(result.candidates[0].lastName).toBe('Smith');
      expect(result.candidates[0].title).toBe('Head of Talent');
      expect(result.candidates[0].email).toBe('alice@acme.com');
      expect(result.candidates[0].roleFamily).toBe('RECRUITING');
      expect(result.candidates[0].evidence).toHaveLength(1);
      expect(result.candidates[0].evidence![0].sourceExcerpt).toBe(
        'Alice Smith leads talent as Head of Talent',
      );
    });

    it('returns valid result on IDENTITY_HALTED response with empty contacts', async () => {
      const mockEnvelope = {
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

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockEnvelope,
      } as Response);

      const result = await adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      });

      expect(result.status).toBe('IDENTITY_HALTED');
      expect(result.candidates).toEqual([]);
      expect(result.unknowns).toContain('identity_related_ambiguous');
    });
  });
});
