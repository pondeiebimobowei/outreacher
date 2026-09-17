import { Injectable } from '@nestjs/common';
import {
  CompanyStatus,
  Evidence,
  Job,
  Opportunity,
  Prisma,
  ResearchRun,
} from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { EvidenceDeduplicator } from '../domain/evidence-deduplicator';
import { OpportunityReconciler } from '../domain/opportunity-reconciler';
import { ResearchFreshnessLimitException } from '../domain/research-freshness.exception';
import { CompanyResearchResult } from '../domain/research.provider.interface';
import {
  IResearchRepository,
  StartResearchOptions,
  StartResearchResult,
} from '../domain/research.repository.interface';

@Injectable()
export class PrismaResearchRepository implements IResearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async startResearch(
    options: StartResearchOptions,
  ): Promise<StartResearchResult> {
    const { companyId, workspaceId, forceRefresh = false } = options;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Lock company row with raw query or atomic lookup to serialize admission decisions
      const company = await tx.company.findFirst({
        where: {
          id: companyId,
          workspaceId,
          status: CompanyStatus.ACTIVE,
        },
      });

      if (!company) {
        throw new AppNotFoundException('Company');
      }

      // 2. Check for an active QUEUED or RUNNING research run
      const activeRun = await tx.researchRun.findFirst({
        where: {
          workspaceId,
          companyId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeRun) {
        return { researchRun: activeRun, reused: true };
      }

      // 3. Check for fresh COMPLETED research run (<24 hours) when forceRefresh is false
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (!forceRefresh) {
        const latestCompleted = await tx.researchRun.findFirst({
          where: {
            workspaceId,
            companyId,
            status: 'COMPLETED',
            completedAt: { gte: twentyFourHoursAgo },
          },
          orderBy: { completedAt: 'desc' },
        });

        if (latestCompleted) {
          return { researchRun: latestCompleted, reused: true };
        }
      }

      // 4. For forced refreshes, count accepted forced refresh Jobs created in the rolling 24h window
      if (forceRefresh) {
        const recentJobs = await tx.job.findMany({
          where: {
            workspaceId,
            type: 'RESEARCH_COMPANY',
            createdAt: { gte: twentyFourHoursAgo },
          },
        });

        const forcedRefreshCount = recentJobs.filter((job: Job) => {
          const payload = job.payload as Record<string, unknown> | null;
          return (
            payload?.companyId === companyId && payload?.forceRefresh === true
          );
        }).length;

        if (forcedRefreshCount >= 3) {
          throw new ResearchFreshnessLimitException(companyId);
        }
      }

      // 5. Atomically create ResearchRun (status=QUEUED) and Job (status=PENDING)
      const researchRun = await tx.researchRun.create({
        data: {
          workspaceId,
          companyId,
          status: 'QUEUED',
        },
      });

      await tx.job.create({
        data: {
          workspaceId,
          type: 'RESEARCH_COMPANY',
          status: 'PENDING',
          idempotencyKey: `research:${researchRun.id}`,
          payload: {
            researchRunId: researchRun.id,
            companyId,
            forceRefresh,
          },
        },
      });

      return { researchRun, reused: false };
    });
  }

  async findLatestRun(
    workspaceId: string,
    companyId: string,
  ): Promise<ResearchRun | null> {
    return this.prisma.researchRun.findFirst({
      where: { workspaceId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRunById(
    workspaceId: string,
    id: string,
  ): Promise<ResearchRun | null> {
    return this.prisma.researchRun.findFirst({
      where: { id, workspaceId },
    });
  }

  async updateRunStatus(
    workspaceId: string,
    id: string,
    status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED',
    data?: {
      startedAt?: Date;
      completedAt?: Date;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<ResearchRun> {
    return this.prisma.researchRun.update({
      where: { id },
      data: {
        status,
        ...(data?.startedAt !== undefined && { startedAt: data.startedAt }),
        ...(data?.completedAt !== undefined && {
          completedAt: data.completedAt,
        }),
        ...(data?.errorCode !== undefined && { errorCode: data.errorCode }),
        ...(data?.errorMessage !== undefined && {
          errorMessage: data.errorMessage,
        }),
      },
    });
  }

  async completeResearchRun(
    workspaceId: string,
    researchRunId: string,
    result: CompanyResearchResult,
  ): Promise<ResearchRun> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.researchRun.findFirst({
        where: { id: researchRunId, workspaceId },
      });

      if (!run) {
        throw new AppNotFoundException('ResearchRun');
      }

      // Ignore if run is already in terminal state
      if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(run.status)) {
        return run;
      }

      // Reconcile Opportunities
      const existingActiveOpps = await tx.opportunity.findMany({
        where: {
          workspaceId,
          companyId: run.companyId,
          status: 'ACTIVE',
        },
      });

      const oppReconciled = OpportunityReconciler.reconcile(
        existingActiveOpps.map((o: Opportunity) => ({
          id: o.id,
          roleTitle: o.roleTitle,
          openingSourceUrl: o.openingSourceUrl,
          opportunityType: o.opportunityType,
          status: o.status,
        })),
        result.opportunities,
      );

      for (const oppUpdate of oppReconciled.toUpdate) {
        const incData = result.opportunities.find(
          (o) =>
            OpportunityReconciler.computeKey(
              o.roleTitle,
              o.openingSourceUrl,
            ) ===
            OpportunityReconciler.computeKey(
              oppUpdate.roleTitle,
              oppUpdate.openingSourceUrl,
            ),
        );

        await tx.opportunity.update({
          where: { id: oppUpdate.id },
          data: {
            roleTitle: oppUpdate.roleTitle,
            openingSourceUrl: oppUpdate.openingSourceUrl,
            opportunityType: oppUpdate.opportunityType,
            ...(incData?.roleUrl !== undefined && { roleUrl: incData.roleUrl }),
            ...(incData?.roleLocation !== undefined && {
              roleLocation: incData.roleLocation,
            }),
            ...(incData?.roleDescription !== undefined && {
              roleDescription: incData.roleDescription,
            }),
          },
        });
      }

      for (const oppCreate of oppReconciled.toCreate) {
        await tx.opportunity.create({
          data: {
            workspaceId,
            companyId: run.companyId,
            researchRunId: run.id,
            status: 'ACTIVE',
            roleTitle: oppCreate.roleTitle,
            openingSourceUrl: oppCreate.openingSourceUrl,
            opportunityType: oppCreate.opportunityType,
            roleUrl: oppCreate.roleUrl ?? null,
            roleLocation: oppCreate.roleLocation ?? null,
            roleDescription: oppCreate.roleDescription ?? null,
            openingDiscoveredAt: new Date(),
          },
        });
      }

      for (const oppIdToSupersede of oppReconciled.toSupersede) {
        await tx.opportunity.update({
          where: { id: oppIdToSupersede },
          data: { status: 'SUPERSEDED' },
        });
      }

      // Deduplicate Evidence
      const existingEvidence = await tx.evidence.findMany({
        where: {
          workspaceId,
          companyId: run.companyId,
        },
      });

      const evDeduplicated = EvidenceDeduplicator.deduplicate(
        existingEvidence.map((e: Evidence) => ({
          id: e.id,
          claim: e.claim,
          classification: e.classification,
          sourceUrl: e.sourceUrl,
        })),
        result.evidence,
      );

      for (const evUpdate of evDeduplicated.toUpdate) {
        await tx.evidence.update({
          where: { id: evUpdate.id },
          data: {
            claim: evUpdate.claim,
            classification: evUpdate.classification,
            sourceName: evUpdate.sourceName ?? null,
            sourceUrl: evUpdate.sourceUrl ?? null,
            sourceExcerpt: evUpdate.sourceExcerpt ?? null,
            confidence: evUpdate.confidence ?? null,
            collectedAt: new Date(),
          },
        });
      }

      for (const evCreate of evDeduplicated.toCreate) {
        await tx.evidence.create({
          data: {
            workspaceId,
            companyId: run.companyId,
            researchRunId: run.id,
            claim: evCreate.claim,
            classification: evCreate.classification,
            sourceName: evCreate.sourceName ?? null,
            sourceUrl: evCreate.sourceUrl ?? null,
            sourceExcerpt: evCreate.sourceExcerpt ?? null,
            confidence: evCreate.confidence ?? null,
            collectedAt: new Date(),
          },
        });
      }

      // Update ResearchRun to final status
      return tx.researchRun.update({
        where: { id: researchRunId },
        data: {
          status: result.status,
          completedAt: new Date(),
        },
      });
    });
  }
}
