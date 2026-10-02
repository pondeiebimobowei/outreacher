import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  CompanyResearchInput,
  CompanyResearchProvider,
  CompanyResearchResult,
} from '../domain/research.provider.interface';
import { RESEARCH_WORKER_PROVIDER_TIMEOUT_MS } from '../research.constants';
import {
  ResearchProviderPermanentException,
  ResearchProviderTimeoutException,
  ResearchProviderTransientException,
  ResearchProviderValidationException,
} from '../domain/research-provider.exception';
import {
  TransportEnvelopeV1,
  TransportEnvelopeV1Schema,
} from './transport-envelope.schema';

@Injectable()
export class HttpCompanyResearchAdapter implements CompanyResearchProvider {
  private readonly logger = new Logger(HttpCompanyResearchAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('RESEARCH_ENGINE_URL') ||
      'http://127.0.0.1:8000';

    const configuredTimeout = Number(
      this.configService.get<number>('RESEARCH_PROVIDER_TIMEOUT_MS') ||
        RESEARCH_WORKER_PROVIDER_TIMEOUT_MS,
    );

    // Timeout Authority Invariant:
    // The adapter's HTTP abort timeout cannot silently exceed the worker's execution timeout limit.
    // If configured higher, clamp to RESEARCH_WORKER_PROVIDER_TIMEOUT_MS with an explicit warning
    // to prevent un-aborted HTTP client hangs on worker timeout races.
    if (configuredTimeout > RESEARCH_WORKER_PROVIDER_TIMEOUT_MS) {
      this.logger.warn(
        `Configured RESEARCH_PROVIDER_TIMEOUT_MS (${configuredTimeout}ms) exceeds worker provider timeout authority (${RESEARCH_WORKER_PROVIDER_TIMEOUT_MS}ms). Clamping adapter timeout to ${RESEARCH_WORKER_PROVIDER_TIMEOUT_MS}ms.`,
      );
      this.timeoutMs = RESEARCH_WORKER_PROVIDER_TIMEOUT_MS;
    } else {
      this.timeoutMs = configuredTimeout;
    }
  }

  async researchCompany(
    input: CompanyResearchInput,
  ): Promise<CompanyResearchResult> {
    // Invariant: Production HTTP research requires a verifiable website or domain.
    // When both are absent, halt immediately with PARTIAL + IDENTITY_UNRESOLVED rather than
    // initiating a 2-6 minute multi-query search fanout that would exceed the 150s worker timeout.
    if (!input.websiteUrl && !input.domain) {
      this.logger.warn(
        `Company "${input.companyName}" (${input.companyId}) lacks websiteUrl and domain. Bypassing HTTP research engine.`,
      );
      return {
        summary: `Company research halted: no website URL or domain provided for "${input.companyName}". Production research requires a verifiable website URL or domain.`,
        findings: [],
        sources: [],
        opportunities: [],
        evidence: [],
        unknowns: ['company_website_url', 'company_domain'],
        status: 'PARTIAL',
        errorCode: 'IDENTITY_UNRESOLVED',
        errorMessage: 'Missing website URL or domain in company profile.',
        identity: {
          confidence: 'UNRESOLVED',
          reasoning: 'Missing domain and website URL in company profile.',
        },
      };
    }

    const requestId = randomUUID();
    const researchRunId = input.companyId; // correlation ID originating from NestJS
    const url = `${this.baseUrl}/research/company`;

    const requestBody = {
      contract_version: '1.0',
      request_id: requestId,
      research_run_id: researchRunId,
      company_name: input.companyName,
      website_url: input.websiteUrl || undefined,
      domain: input.domain || undefined,
      context: input.industry ? { industry: input.industry } : undefined,
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new ResearchProviderTimeoutException(
          `Research provider HTTP request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw new ResearchProviderTransientException(
        `Research provider network failure: ${err.message}`,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseErr: any) {
      if (response.status >= 500) {
        throw new ResearchProviderTransientException(
          `Research provider returned non-JSON 5xx (${response.status})`,
        );
      }
      throw new ResearchProviderValidationException(
        `Failed to parse response JSON from research provider: ${parseErr.message}`,
      );
    }

    // Parse envelope with Zod schema
    const parsedEnvelope = TransportEnvelopeV1Schema.safeParse(rawJson);

    if (!parsedEnvelope.success) {
      if (response.status >= 500) {
        throw new ResearchProviderTransientException(
          `Research provider returned malformed 5xx response: ${parsedEnvelope.error.message}`,
        );
      }
      if (response.status === 400) {
        throw new ResearchProviderPermanentException(
          `Research provider rejected request (HTTP 400): ${JSON.stringify(rawJson)}`,
          'INVALID_REQUEST',
        );
      }
      throw new ResearchProviderValidationException(
        `Research provider response failed envelope validation: ${parsedEnvelope.error.message}`,
      );
    }

    const envelope: TransportEnvelopeV1 = parsedEnvelope.data;

    // Handle HTTP error statuses with valid envelopes
    if (!response.ok) {
      const isRetryable = envelope.error?.retryable ?? (response.status >= 500);
      const errorCode = envelope.error?.code ?? `HTTP_${response.status}`;
      const errorMessage =
        envelope.error?.message ?? `Research provider returned HTTP ${response.status}`;

      if (isRetryable) {
        throw new ResearchProviderTransientException(errorMessage, errorCode);
      } else {
        throw new ResearchProviderPermanentException(errorMessage, errorCode);
      }
    }

    // Status mapping: IDENTITY_HALTED -> PARTIAL + structured errorCode
    if (envelope.status === 'IDENTITY_HALTED') {
      const conf = envelope.identity?.confidence ?? 'UNRESOLVED';
      const errorCode =
        conf === 'AMBIGUOUS' ? 'IDENTITY_AMBIGUOUS' : 'IDENTITY_UNRESOLVED';

      return {
        summary: envelope.result?.summary ?? 'Identity verification could not resolve a single primary domain.',
        findings: (envelope.result?.findings ?? []).map((f) => ({
          title: f.title,
          detail: f.detail,
          whyItMatters: f.whyItMatters ?? undefined,
          sourceUrl: f.sourceUrl ?? undefined,
        })),
        sources: (envelope.result?.sources ?? []).map((s) => ({
          name: s.name,
          url: s.url,
          tier: s.tier,
        })),
        opportunities: (envelope.result?.opportunities ?? []).map((o) => ({
          roleTitle: o.roleTitle,
          openingSourceUrl: o.openingSourceUrl ?? undefined,
          roleUrl: o.roleUrl ?? undefined,
          roleLocation: o.roleLocation ?? undefined,
          roleDescription: o.roleDescription ?? undefined,
          opportunityType: o.opportunityType === 'PROACTIVE' ? 'PROACTIVE' : 'CONFIRMED',
        })),
        evidence: (envelope.result?.evidence ?? []).map((e) => ({
          claim: e.claim,
          classification: e.classification,
          sourceName: e.sourceName ?? undefined,
          sourceUrl: e.sourceUrl ?? undefined,
          sourceExcerpt: e.sourceExcerpt ?? undefined,
          confidence: e.confidence ?? undefined,
        })),
        unknowns: envelope.result?.unknowns ?? [envelope.identity?.reasoning || 'Identity unconfirmed.'],
        status: 'PARTIAL',
        errorCode,
        errorMessage: envelope.identity?.reasoning || 'Identity unconfirmed.',
        identity: envelope.identity
          ? {
              confidence: envelope.identity.confidence,
              domain: envelope.identity.domain ?? undefined,
              websiteUrl: envelope.identity.website_url ?? undefined,
              reasoning: envelope.identity.reasoning ?? undefined,
            }
          : undefined,
      };
    }

    if (envelope.status === 'FAILED') {
      const err = envelope.error;
      const isRetryable = err?.retryable ?? false;
      const code = err?.code ?? 'RESEARCH_FAILED';
      const msg = err?.message ?? 'Research failed';

      if (isRetryable) {
        throw new ResearchProviderTransientException(msg, code);
      }
      throw new ResearchProviderPermanentException(msg, code);
    }

    const res = envelope.result;
    if (!res) {
      throw new ResearchProviderValidationException(
        'Transport envelope has status ' + envelope.status + ' but missing result',
      );
    }

    return {
      summary: res.summary,
      findings: res.findings.map((f) => ({
        title: f.title,
        detail: f.detail,
        whyItMatters: f.whyItMatters ?? undefined,
        sourceUrl: f.sourceUrl ?? undefined,
      })),
      sources: res.sources.map((s) => ({
        name: s.name,
        url: s.url,
        tier: s.tier,
      })),
      opportunities: res.opportunities.map((o) => ({
        roleTitle: o.roleTitle,
        openingSourceUrl: o.openingSourceUrl ?? undefined,
        roleUrl: o.roleUrl ?? undefined,
        roleLocation: o.roleLocation ?? undefined,
        roleDescription: o.roleDescription ?? undefined,
        opportunityType: o.opportunityType === 'PROACTIVE' ? 'PROACTIVE' : 'CONFIRMED',
      })),
      evidence: res.evidence.map((e) => ({
        claim: e.claim,
        classification: e.classification,
        sourceName: e.sourceName ?? undefined,
        sourceUrl: e.sourceUrl ?? undefined,
        sourceExcerpt: e.sourceExcerpt ?? undefined,
        confidence: e.confidence ?? undefined,
      })),
      unknowns: res.unknowns,
      status: res.status,
      identity: envelope.identity
        ? {
            confidence: envelope.identity.confidence,
            domain: envelope.identity.domain ?? undefined,
            websiteUrl: envelope.identity.website_url ?? undefined,
            reasoning: envelope.identity.reasoning ?? undefined,
          }
        : undefined,
    };
  }
}
