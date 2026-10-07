import { ConfigService } from '@nestjs/config';
import { HttpContactDiscoveryAdapter } from './http-contact-discovery.adapter';
import { ContactDiscoveryProviderException } from '../domain/contact-provider.exception';

describe('HttpContactDiscoveryAdapter - 12 Acceptance Test Matrix', () => {
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

  // Case 1: 200 OK + valid COMPLETED payload with candidates
  it('Case 1: returns COMPLETED with mapped candidates and evidence on valid 200 payload', async () => {
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
    expect(result.candidates[0].email).toBe('alice@acme.com');
    expect(result.candidates[0].evidence).toHaveLength(1);
    expect(result.candidates[0].evidence![0].claim).toBe('Alice Smith is Head of Talent');
  });

  // Case 2: 200 OK + valid IDENTITY_HALTED payload
  it('Case 2: returns PARTIAL with empty candidates and identity unknowns on IDENTITY_HALTED', async () => {
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

  // Case 3: 200 OK + valid FAILED payload with typed failure
  it('Case 3: maps typed failure envelope to ContactDiscoveryProviderException with error code and retryable flag', async () => {
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
        code: 'UPSTREAM_SEARCH_FAILED',
        retryable: true,
        message: 'Search query rate limited',
      },
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
    ).rejects.toMatchObject({
      code: 'UPSTREAM_SEARCH_FAILED',
      retryable: true,
      message: 'Search query rate limited',
    });
  });

  // Case 4: 409 Conflict
  it('Case 4: maps 409 Conflict to NON-RETRYABLE provider failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        failure: {
          code: 'DISCOVERY_OPERATIONAL_FAILURE',
          retryable: false,
          message: 'Idempotency conflict: run_id already in progress with different parameters',
        },
      }),
    } as Response);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_OPERATIONAL_FAILURE',
      retryable: false,
    });
  });

  // Case 5: 429 Too Many Requests
  it('Case 5: maps 429 Too Many Requests to RETRYABLE ACQUISITION_RATE_LIMITED failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limit exceeded' }),
    } as Response);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'ACQUISITION_RATE_LIMITED',
      retryable: true,
    });
  });

  // Case 6: 500 / 502 / 503 / 504
  it('Case 6: maps 5xx gateway errors to RETRYABLE DISCOVERY_OPERATIONAL_FAILURE', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    } as Response);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_OPERATIONAL_FAILURE',
      retryable: true,
    });
  });

  // Case 7: Request timeout
  it('Case 7: maps request timeout to RETRYABLE DISCOVERY_TIMEOUT', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortErr);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_TIMEOUT',
      retryable: true,
    });
  });

  // Case 8: Schema validation failure (invalid envelope, missing fields, or forbidden fields)
  it('Case 8: maps schema validation failure to NON-RETRYABLE CONTRACT_SCHEMA_INVALID', async () => {
    const invalidEnvelope = {
      contract_version: '99.9', // invalid version
      discovery_run_id: 'not-a-uuid',
      status: 'UNKNOWN_STATUS',
    };

    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => invalidEnvelope,
    } as Response);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'CONTRACT_SCHEMA_INVALID',
      retryable: false,
    });
  });

  // Case 9: Canonical domain mismatch between request and envelope
  it('Case 9: maps canonical domain mismatch between request and envelope to NON-RETRYABLE CONTRACT_SCHEMA_INVALID', async () => {
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
    ).rejects.toMatchObject({
      code: 'CONTRACT_SCHEMA_INVALID',
      retryable: false,
    });
  });

  // Case 10: SSRF / unsafe destination rejection
  it('Case 10: rejects unsafe SSRF destinations pre-network with 0 outbound calls', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await adapter.discoverContacts({
      companyId: 'comp-1',
      workspaceId: 'ws-1',
      companyName: 'Acme Corp',
      websiteUrl: 'http://127.0.0.1:8080/admin',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe('PARTIAL');
    expect(result.errorCode).toBe('IDENTITY_UNRESOLVED');
    expect(result.candidates).toEqual([]);
  });

  // Case 11: Malformed JSON response body
  it('Case 11: maps malformed JSON response body to NON-RETRYABLE CONTRACT_SCHEMA_INVALID', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    } as unknown as Response);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'CONTRACT_SCHEMA_INVALID',
      retryable: false,
    });
  });

  // Case 12: In-flight abort / cancellation
  it('Case 12: handles in-flight abort cleanly without unhandled rejection', async () => {
    const abortErr = new DOMException('The user aborted a request.', 'AbortError');
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortErr);

    await expect(
      adapter.discoverContacts({
        companyId: 'comp-1',
        workspaceId: 'ws-1',
        companyName: 'Acme Corp',
        domain: 'acme.com',
      }),
    ).rejects.toMatchObject({
      code: 'DISCOVERY_TIMEOUT',
      retryable: true,
    });
  });
});
