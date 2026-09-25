import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PrismaWorkspaceSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOutreachReviews(workspaceId: string, limit: number) {
    return this.prisma.campaignMember.findMany({
      where: { workspaceId, status: 'PENDING' },
      include: {
        person: {
          include: {
            personCompanyAssociations: { include: { company: true } },
          },
        },
        campaign: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async getSendFailures(workspaceId: string, limit: number) {
    return this.prisma.campaignMember.findMany({
      where: { workspaceId, status: 'FAILED' },
      include: {
        person: {
          include: {
            personCompanyAssociations: { include: { company: true } },
          },
        },
        campaign: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async getIncompleteResearch(workspaceId: string, limit: number) {
    return this.prisma.researchRun.findMany({
      where: {
        workspaceId,
        status: { in: ['RUNNING', 'PARTIAL'] },
      },
      include: {
        company: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  async getPausedCampaigns(workspaceId: string, limit: number) {
    return this.prisma.campaign.findMany({
      where: { workspaceId, status: 'PAUSED' },
      include: {
        company: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  // --- Recent Activity ---

  async getCompletedResearchActivity(workspaceId: string, limit: number) {
    return this.prisma.researchRun.findMany({
      where: { workspaceId, status: 'COMPLETED' },
      include: {
        company: true,
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
  }

  async getContactSelectedActivity(workspaceId: string, limit: number) {
    return this.prisma.companyContactSelection.findMany({
      where: { workspaceId },
      include: {
        company: true,
      },
      orderBy: { selectedAt: 'desc' },
      take: limit,
    });
  }

  async getEmailSentActivity(workspaceId: string, limit: number) {
    return this.prisma.emailSend.findMany({
      where: { workspaceId, status: 'SENT' },
      include: {
        campaignMember: {
          include: {
            person: {
              include: {
                personCompanyAssociations: { include: { company: true } },
              },
            },
            campaign: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  }

  async getOutcomeRecordedActivity(workspaceId: string, limit: number) {
    return this.prisma.outcome.findMany({
      where: { workspaceId },
      include: {
        campaignMember: {
          include: {
            person: {
              include: {
                personCompanyAssociations: { include: { company: true } },
              },
            },
            campaign: true,
          },
        },
      },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }
}
