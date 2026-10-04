import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  ContactDiscoveryInput,
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
  DiscoveredContactCandidate,
} from '../domain/contact.provider.interface';
import { ContactDiscoveryProviderException } from '../domain/contact-provider.exception';
import {
  ALLOWED_ROLE_ADDRESS_MAILBOXES,
  DEFAULT_CONTACT_WORKER_PROVIDER_TIMEOUT_MS,
} from '../domain/contact.constants';
import { normalizeCompanyDomain } from '../../company/domain/company.domain';
import { ContactDiscoveryResponseSchema } from './transport-envelope.schema';

@Injectable()
export class HttpContactDiscoveryAdapter implements ContactDiscoveryProvider {
  private readonly logger = new Logger(HttpContactDiscoveryAdapter.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('RESEARCH_ENGINE_URL') ||
      'http://127.0.0.1:8000';
    this.timeoutMs = Number(
      this.configService.get<number>('CONTACT_PROVIDER_TIMEOUT_MS') ||
        DEFAULT_CONTACT_WORKER_PROVIDER_TIMEOUT_MS,
    );
  }

  async discoverContacts(
    input: ContactDiscoveryInput,
  ): Promise<ContactDiscoveryResult> {
    // 1. Pre-network input conflict resolution
    const canonicalUrlDomain = normalizeCompanyDomain(input.websiteUrl);
    const canonicalDomain = normalizeCompanyDomain(input.domain);
    let expectedCanonicalDomain: string;

    if (!canonicalUrlDomain && !canonicalDomain) {
      this.logger.warn(
        `Company "${input.companyName}" (${input.companyId}) lacks websiteUrl and domain. Bypassing HTTP contact discovery.`,
      );
      return {
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        discoveredAt: new Date(),
        candidates: [],
        status: 'PARTIAL',
        unknowns: ['company_website_url', 'company_domain'],
        errorCode: 'IDENTITY_UNRESOLVED',
        metadata: {
          reasoning: 'Neither website URL nor domain provided for company.',
        },
      };
    } else if (canonicalUrlDomain && !canonicalDomain) {
      expectedCanonicalDomain = canonicalUrlDomain;
    } else if (!canonicalUrlDomain && canonicalDomain) {
      expectedCanonicalDomain = canonicalDomain;
    } else {
      if (canonicalUrlDomain !== canonicalDomain) {
        this.logger.warn(
          `Company "${input.companyName}" input websiteUrl (${canonicalUrlDomain}) conflicts with input domain (${canonicalDomain}). Bypassing HTTP contact discovery.`,
        );
        return {
          companyId: input.companyId,
          workspaceId: input.workspaceId,
          discoveredAt: new Date(),
          candidates: [],
          status: 'PARTIAL',
          unknowns: ['company_website_url', 'company_domain'],
          errorCode: 'IDENTITY_AMBIGUOUS',
          metadata: {
            reasoning: `Input websiteUrl (${canonicalUrlDomain}) conflicts with input domain (${canonicalDomain}).`,
          },
        };
      }
      expectedCanonicalDomain = canonicalDomain!;
    }

    // 2. Dispatch HTTP request with UUID v4 run ID
    const requestId = randomUUID();
    const discoveryRunId = randomUUID();
    const url = `${this.baseUrl}/contact/discover`;

    const requestBody = {
      contract_version: '1.0',
      request_id: requestId,
      discovery_run_id: discoveryRunId,
      company_name: input.companyName,
      website_url: input.websiteUrl || undefined,
      domain: input.domain || undefined,
      target_roles: input.targetRoles || undefined,
      context: input.industry
        ? {
            industry: input.industry,
            company_id: input.companyId,
            workspace_id: input.workspaceId,
          }
        : undefined,
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
        throw new ContactDiscoveryProviderException(
          `Contact discovery provider HTTP request timed out after ${this.timeoutMs}ms`,
          'DISCOVERY_TIMEOUT',
          true,
        );
      }
      throw new ContactDiscoveryProviderException(
        `Contact discovery provider network failure: ${err.message}`,
        'DISCOVERY_OPERATIONAL_FAILURE',
        true,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseErr: any) {
      if (response.status >= 500) {
        throw new ContactDiscoveryProviderException(
          `Contact discovery provider returned non-JSON 5xx (${response.status})`,
          'DISCOVERY_OPERATIONAL_FAILURE',
          true,
        );
      }
      throw new ContactDiscoveryProviderException(
        `Failed to parse response JSON from contact discovery provider: ${parseErr.message}`,
        'CONTRACT_SCHEMA_INVALID',
        false,
      );
    }

    // 3. Zod validation
    const parsedEnvelope = ContactDiscoveryResponseSchema.safeParse(rawJson);
    if (!parsedEnvelope.success) {
      throw new ContactDiscoveryProviderException(
        `Contact discovery provider response failed schema validation: ${parsedEnvelope.error.message}`,
        'CONTRACT_SCHEMA_INVALID',
        false,
      );
    }

    const envelope = parsedEnvelope.data;

    // 4. Handle Python FAILED envelope via typed failure object: MUST throw exception, NEVER return success
    if (envelope.status === 'FAILED') {
      const failure = envelope.failure!;
      throw new ContactDiscoveryProviderException(
        failure.message,
        failure.code,
        failure.retryable,
      );
    }

    // 5. Pin Provider Identity to Requested Company Domain
    const providerDomain = normalizeCompanyDomain(
      envelope.identity.verified_domain,
    );
    if (providerDomain !== expectedCanonicalDomain) {
      throw new ContactDiscoveryProviderException(
        `Provider returned verified domain "${providerDomain}" which does not match requested canonical domain "${expectedCanonicalDomain}"`,
        'CONTRACT_SCHEMA_INVALID',
        false,
      );
    }

    // 6. Semantic Validation: ROLE_ADDRESS mailbox and first-party domain rules
    for (const contact of envelope.contacts) {
      if (contact.person_kind === 'ROLE_ADDRESS') {
        const [localPart] = contact.email.split('@');
        if (!ALLOWED_ROLE_ADDRESS_MAILBOXES.has(localPart.toLowerCase())) {
          throw new ContactDiscoveryProviderException(
            `ROLE_ADDRESS mailbox "${localPart}" is not an allowed corporate mailbox`,
            'CONTRACT_SCHEMA_INVALID',
            false,
          );
        }
      }

      if (contact.email) {
        const emailDomain = normalizeCompanyDomain(contact.email.split('@')[1]);
        if (
          !emailDomain ||
          (emailDomain !== expectedCanonicalDomain &&
            !emailDomain.endsWith('.' + expectedCanonicalDomain))
        ) {
          throw new ContactDiscoveryProviderException(
            `Contact email "${contact.email}" violates corporate-domain rule for "${expectedCanonicalDomain}"`,
            'CONTRACT_SCHEMA_INVALID',
            false,
          );
        }
      }

      const sourceHost = normalizeCompanyDomain(contact.source_url);
      if (
        !sourceHost ||
        (sourceHost !== expectedCanonicalDomain &&
          !sourceHost.endsWith('.' + expectedCanonicalDomain))
      ) {
        throw new ContactDiscoveryProviderException(
          `Contact source URL "${contact.source_url}" violates canonical first-party rule for "${expectedCanonicalDomain}"`,
          'CONTRACT_SCHEMA_INVALID',
          false,
        );
      }

      for (const ev of contact.evidence) {
        const evHost = normalizeCompanyDomain(ev.source_url);
        if (
          !evHost ||
          (evHost !== expectedCanonicalDomain &&
            !evHost.endsWith('.' + expectedCanonicalDomain))
        ) {
          throw new ContactDiscoveryProviderException(
            `Evidence source URL "${ev.source_url}" violates canonical first-party rule for "${expectedCanonicalDomain}"`,
            'CONTRACT_SCHEMA_INVALID',
            false,
          );
        }
      }
    }

    // 7. Map to DiscoveredContactCandidate domain objects
    const mappedCandidates: DiscoveredContactCandidate[] =
      envelope.contacts.map((c) => ({
        firstName: c.first_name,
        lastName: c.last_name,
        title: c.title,
        email: c.email,
        personKind: c.person_kind,
        confidence: c.confidence,
        roleFamily: c.role_family,
        source: c.source,
        sourceUrl: c.source_url,
        evidence: c.evidence.map((ev) => ({
          claim: ev.claim,
          sourceName: ev.source_name,
          sourceUrl: ev.source_url,
          sourceExcerpt: ev.source_excerpt,
          classification: ev.classification,
          confidence: ev.confidence,
        })),
      }));

    return {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      discoveredAt: new Date(),
      candidates: mappedCandidates,
      status: envelope.status,
      unknowns: envelope.unknowns,
      metadata: envelope.metadata as Record<string, unknown> | undefined,
    };
  }
}
