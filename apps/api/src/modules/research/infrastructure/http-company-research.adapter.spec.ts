import { HttpCompanyResearchAdapter } from './http-company-research.adapter';
import {
  ResearchProviderPermanentException,
  ResearchProviderTimeoutException,
  ResearchProviderTransientException,
  ResearchProviderValidationException,
} from '../domain/research-provider.exception';
import { CompanyResearchInput } from '../domain/research.provider.interface';

describe('HttpCompanyResearchAdapter', () => {
  let adapter: HttpCompanyResearchAdapter;
  let originalFetch: typeof global.fetch;

  const mockInput: CompanyResearchInput = {
    companyId: 'comp-123',
    workspaceId: 'ws-456',
    companyName: 'Acme Corp',
    websiteUrl: 'https://acme.com',
    domain: 'acme.com',
    industry: 'Software',
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'RESEARCH_ENGINE_URL') return 'http://localhost:8000';
        if (key === 'RESEARCH_PROVIDER_TIMEOUT_MS') return 1000;
        return undefined;
      }),
    };
    adapter = new HttpCompanyResearchAdapter(mockConfigService as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps successful COMPLETED response correctly', async () => {
    const mockEnvelope = {
      contract_version: '1.0',
      engine_version: '0.1.0',
      request_id: 'req-1',
      research_run_id: 'run-1',
      status: 'COMPLETED',
      identity: {
        confidence: 'CONFIDENT',
        domain: 'acme.com',
        website_url: 'https://acme.com',
        reasoning: 'Verified official corporate domain.',
      },
      result: {
        summary: 'Acme builds enterprise tools.',
        findings: [
          {
            title: 'Cloud offering',
            detail: 'Acme offers cloud services.',
            whyItMatters: 'Expands addressable market.',
            sourceUrl: 'https://acme.com/cloud',
            claimId: 'claim-1',
            evidenceRefs: ['ev-1'],
          },
        ],
        sources: [
          {
            name: 'Acme About',
            url: 'https://acme.com/about',
            tier: 'TIER_1',
          },
        ],
        opportunities: [
          {
            roleTitle: 'Senior Backend Engineer',
            openingSourceUrl: 'https://acme.com/careers',
            roleUrl: 'https://acme.com/careers/123',
            roleLocation: 'Remote',
            roleDescription: 'Build scalable APIs',
            opportunityType: 'CONFIRMED',
          },
        ],
        evidence: [
          {
            claim: 'Acme offers enterprise cloud services.',
            classification: 'FACT',
            sourceName: 'Acme About',
            sourceUrl: 'https://acme.com/about',
            sourceExcerpt: 'Acme offers enterprise cloud services.',
            confidence: 'HIGH',
            claimId: 'claim-1',
            evidenceRef: 'ev-1',
          },
        ],
        unknowns: [],
        status: 'COMPLETED',
      },
      error: null,
      metadata: {
        duration_ms: 1200,
        completed_at: new Date().toISOString(),
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEnvelope),
    } as any);

    const result = await adapter.researchCompany(mockInput);

    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toBe('Acme builds enterprise tools.');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      title: 'Cloud offering',
      detail: 'Acme offers cloud services.',
      whyItMatters: 'Expands addressable market.',
      sourceUrl: 'https://acme.com/cloud',
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toEqual({
      claim: 'Acme offers enterprise cloud services.',
      classification: 'FACT',
      sourceName: 'Acme About',
      sourceUrl: 'https://acme.com/about',
      sourceExcerpt: 'Acme offers enterprise cloud services.',
      confidence: 'HIGH',
    });
    expect(result.identity).toEqual({
      confidence: 'CONFIDENT',
      domain: 'acme.com',
      websiteUrl: 'https://acme.com',
      reasoning: 'Verified official corporate domain.',
    });
    expect(result.errorCode).toBeUndefined();
  });

  it('maps IDENTITY_HALTED into PARTIAL status with explicit errorCode', async () => {
    const mockEnvelope = {
      contract_version: '1.0',
      engine_version: '0.1.0',
      request_id: 'req-2',
      research_run_id: 'run-2',
      status: 'IDENTITY_HALTED',
      identity: {
        confidence: 'AMBIGUOUS',
        domain: null,
        website_url: null,
        reasoning: 'Target identity ambiguous across search candidates.',
      },
      result: null,
      error: null,
      metadata: {
        duration_ms: 450,
        completed_at: new Date().toISOString(),
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEnvelope),
    } as any);

    const result = await adapter.researchCompany(mockInput);

    expect(result.status).toBe('PARTIAL');
    expect(result.errorCode).toBe('IDENTITY_AMBIGUOUS');
    expect(result.identity?.confidence).toBe('AMBIGUOUS');
    expect(result.summary).toContain('Identity verification could not resolve');
  });

  it('maps IDENTITY_HALTED with UNRESOLVED confidence into PARTIAL + IDENTITY_UNRESOLVED', async () => {
    const mockEnvelope = {
      contract_version: '1.0',
      engine_version: '0.1.0',
      request_id: 'req-3',
      research_run_id: 'run-3',
      status: 'IDENTITY_HALTED',
      identity: {
        confidence: 'UNRESOLVED',
        domain: 'fake-unrelated-domain.xyz',
        website_url: 'https://fake-unrelated-domain.xyz',
        reasoning: 'Failed to verify supplied website/domain: unrelated entity',
      },
      result: null,
      error: null,
      metadata: {
        duration_ms: 300,
        completed_at: new Date().toISOString(),
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockEnvelope),
    } as any);

    const result = await adapter.researchCompany(mockInput);

    expect(result.status).toBe('PARTIAL');
    expect(result.errorCode).toBe('IDENTITY_UNRESOLVED');
    expect(result.identity?.confidence).toBe('UNRESOLVED');
  });

  it('throws ResearchProviderValidationException on malformed 200 envelope', async () => {
    const malformedEnvelope = {
      contract_version: 'wrong-version',
      result: null,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(malformedEnvelope),
    } as any);

    await expect(adapter.researchCompany(mockInput)).rejects.toThrow(
      ResearchProviderValidationException,
    );
  });

  it('throws ResearchProviderPermanentException on 400 Bad Request', async () => {
    const errorEnvelope = {
      contract_version: '1.0',
      engine_version: '0.1.0',
      request_id: 'req-err',
      research_run_id: 'run-err',
      result: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        retryable: false,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue(errorEnvelope),
    } as any);

    await expect(adapter.researchCompany(mockInput)).rejects.toThrow(
      ResearchProviderPermanentException,
    );
  });

  it('throws ResearchProviderTransientException on 503 Service Unavailable', async () => {
    const errorEnvelope = {
      contract_version: '1.0',
      engine_version: '0.1.0',
      request_id: 'req-503',
      research_run_id: 'run-503',
      result: null,
      error: {
        code: 'UPSTREAM_OVERLOAD',
        message: 'Downstream rate limit reached',
        retryable: true,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue(errorEnvelope),
    } as any);

    await expect(adapter.researchCompany(mockInput)).rejects.toThrow(
      ResearchProviderTransientException,
    );
  });

  it('throws ResearchProviderTimeoutException on abort signal', async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    await expect(adapter.researchCompany(mockInput)).rejects.toThrow(
      ResearchProviderTimeoutException,
    );
  });

  it('halts immediately with PARTIAL + IDENTITY_UNRESOLVED when websiteUrl and domain are absent', async () => {
    const nakedInput: CompanyResearchInput = {
      companyId: 'comp-naked',
      workspaceId: 'ws-456',
      companyName: 'Naked Corp',
      websiteUrl: null,
      domain: null,
    };

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const result = await adapter.researchCompany(nakedInput);
    expect(result.status).toBe('PARTIAL');
    expect(result.errorCode).toBe('IDENTITY_UNRESOLVED');
    expect(result.identity?.confidence).toBe('UNRESOLVED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('timeout authority invariants', () => {
    it('clamps configured timeout to worker limit (150000ms) when environment sets a higher value', () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'RESEARCH_PROVIDER_TIMEOUT_MS') return 250000;
          return undefined;
        }),
      };
      const highTimeoutAdapter = new HttpCompanyResearchAdapter(mockConfig as any);
      expect((highTimeoutAdapter as any).timeoutMs).toBe(150000);
    });

    it('defaults to worker limit (150000ms) when RESEARCH_PROVIDER_TIMEOUT_MS is unconfigured', () => {
      const mockConfig = {
        get: jest.fn(() => undefined),
      };
      const defaultTimeoutAdapter = new HttpCompanyResearchAdapter(mockConfig as any);
      expect((defaultTimeoutAdapter as any).timeoutMs).toBe(150000);
    });

    it('respects configured timeout when below worker limit (e.g. 60000ms)', () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'RESEARCH_PROVIDER_TIMEOUT_MS') return 60000;
          return undefined;
        }),
      };
      const lowerTimeoutAdapter = new HttpCompanyResearchAdapter(mockConfig as any);
      expect((lowerTimeoutAdapter as any).timeoutMs).toBe(60000);
    });
  });
});
