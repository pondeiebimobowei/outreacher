import { Inject, Injectable } from '@nestjs/common';
import { JobStatus, OpportunityStatus, OpportunityType } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { ContactRelevanceEvaluator } from '../domain/contact-relevance.evaluator';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../domain/contact.repository.interface';

export interface EvaluatedContactDto {
  id: string;
  workspaceId: string;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  firstName: string;
  lastName: string;
  email: string | null;
  title: string | null;
  source: string | null;
  sourceUrl: string | null;
  confidence: string | null; // Identity Confidence (HIGH, MEDIUM, LOW)
  emailConfidence: 'AVAILABLE' | 'UNAVAILABLE'; // Strict Email Confidence Terminology
  discoveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendationRationale: string;
  isSelected: boolean;
}

export interface CompanyContactsResponse {
  companyId: string;
  status:
    'NOT_STARTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  selectedContactId: string | null;
  contacts: EvaluatedContactDto[];
  discoveryJob: {
    id: string;
    status: string;
    createdAt: Date;
    completedAt?: Date | null;
  } | null;
  mock?: boolean;
}

@Injectable()
export class GetCompanyContactsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyContactsResponse> {
    // 1. Verify company existence and workspace ownership
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, workspaceId },
    });

    if (!company) {
      throw new AppNotFoundException(
        `Company ${companyId} not found in workspace.`,
      );
    }

    // 2. Fetch User Career Profile Target Roles
    const careerProfile = await this.prisma.careerProfile.findUnique({
      where: { workspaceId },
    });
    const targetRoles = careerProfile?.targetRoles?.filter(Boolean) ?? [];

    // 3. Fetch Active Confirmed Opportunities for Company
    const confirmedOpps = await this.prisma.opportunity.findMany({
      where: {
        workspaceId,
        companyId,
        status: OpportunityStatus.ACTIVE,
        opportunityType: OpportunityType.CONFIRMED,
      },
    });
    const confirmedOpportunityTitles = confirmedOpps
      .map((o) => o.roleTitle)
      .filter((t): t is string => Boolean(t));

    // 4. Fetch Discovered Contacts & Active Selection
    const rawContacts = await this.contactRepository.findCompanyContacts(
      workspaceId,
      companyId,
    );
    const activeSelection =
      await this.contactRepository.getCompanyContactSelection(
        workspaceId,
        companyId,
      );
    const selectedContactId = activeSelection?.personId ?? null;

    // 5. Fetch Latest Discovery Job Status
    const latestJob = await this.prisma.job.findFirst({
      where: {
        workspaceId,
        type: 'CONTACT_DISCOVERY',
        payload: {
          path: ['companyId'],
          equals: companyId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let status: CompanyContactsResponse['status'] = 'NOT_STARTED';
    let isMockRun = false;

    if (latestJob) {
      const payload = latestJob.payload as Record<string, unknown> | null;
      if (payload?.mock === true) {
        isMockRun = true;
      }
      if (latestJob.status === JobStatus.PENDING) {
        status = 'QUEUED';
      } else if (latestJob.status === JobStatus.RUNNING) {
        status = 'RUNNING';
      } else if (latestJob.status === JobStatus.COMPLETED) {
        status = 'COMPLETED';
      } else if (
        latestJob.status === JobStatus.FAILED ||
        latestJob.status === JobStatus.DEAD_LETTER
      ) {
        status = 'FAILED';
      }
    }

    if (status === 'NOT_STARTED' && rawContacts.length > 0) {
      status = 'COMPLETED';
    }

    // Hard Execution Constraint: Always surface mock: true badge flag if environment or dev config specifies mock providers
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.USE_MOCK_PROVIDERS === 'true'
    ) {
      isMockRun = true;
    }

    // 6. Evaluate Relevance & Rationale for Each Candidate
    const evaluatedContacts: EvaluatedContactDto[] = rawContacts.map((c) => {
      const evalResult = ContactRelevanceEvaluator.evaluate({
        title: c.title,
        personKind: c.personKind,
        email: c.email,
        targetRoles,
        confirmedOpportunityTitles,
      });

      return {
        id: c.id,
        workspaceId: c.workspaceId,
        personKind: c.personKind,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        title: c.title,
        source: c.source,
        sourceUrl: c.sourceUrl,
        confidence: c.confidence || 'MEDIUM',
        emailConfidence: c.email ? 'AVAILABLE' : 'UNAVAILABLE',
        discoveredAt: c.discoveredAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        relevance: evalResult.relevance,
        recommendationRationale: evalResult.recommendationRationale,
        isSelected: c.id === selectedContactId,
      };
    });

    // Sort evaluated contacts:
    // 1. Relevance: HIGH -> MEDIUM -> LOW
    // 2. Email availability: AVAILABLE -> UNAVAILABLE
    // 3. Selection status: Selected first
    const relevanceRank: Record<string, number> = {
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };
    evaluatedContacts.sort((a, b) => {
      if (a.isSelected !== b.isSelected) {
        return a.isSelected ? -1 : 1;
      }
      const relDiff = relevanceRank[b.relevance] - relevanceRank[a.relevance];
      if (relDiff !== 0) return relDiff;

      if (a.emailConfidence !== b.emailConfidence) {
        return a.emailConfidence === 'AVAILABLE' ? -1 : 1;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      companyId,
      status,
      selectedContactId,
      contacts: evaluatedContacts,
      discoveryJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            createdAt: latestJob.createdAt,
            completedAt: latestJob.completedAt,
          }
        : null,
      mock: isMockRun,
    };
  }
}
