import { Injectable, Logger } from '@nestjs/common';
import { PrismaWorkspaceSummaryRepository } from '../infrastructure/prisma-workspace-summary.repository';
import {
  WorkspaceSummaryDto,
  WorkspaceWorkItemDto,
  WorkspaceActivityItemDto,
  DegradedSourceDto,
} from '../dto/workspace-summary.dto';

@Injectable()
export class GetWorkspaceSummaryUseCase {
  private readonly logger = new Logger(GetWorkspaceSummaryUseCase.name);

  constructor(private readonly repository: PrismaWorkspaceSummaryRepository) {}

  public async execute(workspaceId: string): Promise<WorkspaceSummaryDto> {
    const degradedSources: DegradedSourceDto[] = [];
    const workItems: WorkspaceWorkItemDto[] = [];
    let recentActivity: WorkspaceActivityItemDto[] = [];

    const results = await Promise.allSettled([
      this.repository.getOutreachReviews(workspaceId, 20),
      this.repository.getSendFailures(workspaceId, 20),
      this.repository.getIncompleteResearch(workspaceId, 20),
      this.repository.getPausedCampaigns(workspaceId, 20),
      this.repository.getCompletedResearchActivity(workspaceId, 20),
      this.repository.getContactSelectedActivity(workspaceId, 20),
      this.repository.getEmailSentActivity(workspaceId, 20),
      this.repository.getOutcomeRecordedActivity(workspaceId, 20),
    ]);

    if (results[0].status === 'fulfilled') {
      workItems.push(
        ...results[0].value.map((item) => ({
          id: `review_${item.id}`,
          kind: 'OUTREACH_REVIEW' as const,
          company: {
            id: item.person.personCompanyAssociations?.[0]?.company.id,
            name: item.person.personCompanyAssociations?.[0]?.company.name,
          },
          campaign: item.campaign
            ? {
                id: item.campaign.id,
                name: item.campaign.name,
                status: item.campaign.status,
              }
            : undefined,
          campaignMember: { id: item.id, status: item.status },
          updatedAt: item.updatedAt.toISOString(),
          source: { domain: 'OUTREACH' as const, state: item.status },
          destination: { type: 'CONTACT_REVIEW' as const },
        })),
      );
    } else {
      this.logger.error('Failed to fetch outreach reviews', results[0].reason);
      degradedSources.push({
        source: 'WORK_OUTREACH_REVIEW',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[1].status === 'fulfilled') {
      workItems.push(
        ...results[1].value.map((item) => ({
          id: `failure_${item.id}`,
          kind: 'SEND_FAILURE' as const,
          company: {
            id: item.person.personCompanyAssociations?.[0]?.company.id,
            name: item.person.personCompanyAssociations?.[0]?.company.name,
          },
          campaign: item.campaign
            ? {
                id: item.campaign.id,
                name: item.campaign.name,
                status: item.campaign.status,
              }
            : undefined,
          campaignMember: { id: item.id, status: item.status },
          updatedAt: item.updatedAt.toISOString(),
          source: { domain: 'OUTREACH' as const, state: item.status },
          destination: { type: 'CAMPAIGN' as const },
        })),
      );
    } else {
      this.logger.error('Failed to fetch send failures', results[1].reason);
      degradedSources.push({
        source: 'WORK_SEND_FAILURE',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[2].status === 'fulfilled') {
      workItems.push(
        ...results[2].value.map((item) => ({
          id: `research_${item.id}`,
          kind: 'RESEARCH_INCOMPLETE' as const,
          company: { id: item.company.id, name: item.company.name },
          updatedAt: item.updatedAt.toISOString(),
          source: { domain: 'RESEARCH' as const, state: item.status },
          destination: { type: 'COMPANY' as const },
        })),
      );
    } else {
      this.logger.error(
        'Failed to fetch incomplete research',
        results[2].reason,
      );
      degradedSources.push({
        source: 'WORK_RESEARCH_INCOMPLETE',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[3].status === 'fulfilled') {
      workItems.push(
        ...results[3].value.map((item) => ({
          id: `campaign_${item.id}`,
          kind: 'CAMPAIGN_PAUSED' as const,
          company: { id: item.company.id, name: item.company.name },
          campaign: { id: item.id, name: item.name, status: item.status },
          updatedAt: item.updatedAt.toISOString(),
          source: { domain: 'CAMPAIGN' as const, state: item.status },
          destination: { type: 'CAMPAIGN' as const },
        })),
      );
    } else {
      this.logger.error('Failed to fetch paused campaigns', results[3].reason);
      degradedSources.push({
        source: 'WORK_CAMPAIGN_PAUSED',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[4].status === 'fulfilled') {
      recentActivity.push(
        ...results[4].value.map((item) => ({
          id: `act_res_${item.id}`,
          sourceType: 'RESEARCH_RUN',
          sourceId: item.id,
          type: 'RESEARCH_COMPLETED' as const,
          company: { id: item.company.id, name: item.company.name },
          occurredAt: item.completedAt!.toISOString(),
        })),
      );
    } else {
      this.logger.error(
        'Failed to fetch completed research',
        results[4].reason,
      );
      degradedSources.push({
        source: 'ACTIVITY_RESEARCH_COMPLETED',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[5].status === 'fulfilled') {
      recentActivity.push(
        ...results[5].value.map((item) => ({
          id: `act_sel_${item.id}`,
          sourceType: 'COMPANY_CONTACT_SELECTION',
          sourceId: item.id,
          type: 'CONTACT_SELECTED' as const,
          company: { id: item.company.id, name: item.company.name },
          occurredAt: item.selectedAt.toISOString(),
        })),
      );
    } else {
      this.logger.error(
        'Failed to fetch contact selections',
        results[5].reason,
      );
      degradedSources.push({
        source: 'ACTIVITY_CONTACT_SELECTED',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[6].status === 'fulfilled') {
      recentActivity.push(
        ...results[6].value.map((item) => ({
          id: `act_sent_${item.id}`,
          sourceType: 'EMAIL_SEND',
          sourceId: item.id,
          type: 'EMAIL_SENT' as const,
          company: {
            id: item.campaignMember.person.personCompanyAssociations?.[0]?.company.id,
            name: item.campaignMember.person.personCompanyAssociations?.[0]?.company.name,
          },
          campaign: item.campaignMember.campaign
            ? {
                id: item.campaignMember.campaign.id,
                name: item.campaignMember.campaign.name,
              }
            : undefined,
          occurredAt: item.sentAt!.toISOString(),
        })),
      );
    } else {
      this.logger.error('Failed to fetch email sends', results[6].reason);
      degradedSources.push({
        source: 'ACTIVITY_EMAIL_SENT',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    if (results[7].status === 'fulfilled') {
      recentActivity.push(
        ...results[7].value.map((item) => ({
          id: `act_out_${item.id}`,
          sourceType: 'OUTCOME',
          sourceId: item.id,
          type: 'OUTCOME_RECORDED' as const,
          company: {
            id: item.campaignMember.person.personCompanyAssociations?.[0]?.company.id,
            name: item.campaignMember.person.personCompanyAssociations?.[0]?.company.name,
          },
          campaign: item.campaignMember.campaign
            ? {
                id: item.campaignMember.campaign.id,
                name: item.campaignMember.campaign.name,
              }
            : undefined,
          occurredAt: item.recordedAt.toISOString(),
        })),
      );
    } else {
      this.logger.error('Failed to fetch outcomes', results[7].reason);
      degradedSources.push({
        source: 'ACTIVITY_OUTCOME_RECORDED',
        code: 'PARTIAL_DATA_UNAVAILABLE',
      });
    }

    recentActivity.sort((a, b) => {
      const timeDiff =
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    recentActivity = recentActivity.slice(0, 20);

    return {
      workspace: { id: workspaceId },
      workItems,
      recentActivity,
      degradedSources: degradedSources.length > 0 ? degradedSources : undefined,
      generatedAt: new Date().toISOString(),
    };
  }
}
