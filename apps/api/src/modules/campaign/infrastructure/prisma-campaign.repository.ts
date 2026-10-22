import { Injectable } from '@nestjs/common';
import { Campaign, CampaignMember, CampaignStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CampaignDuplicateNameError,
  CreateCampaignData,
  ICampaignRepository,
  CampaignWithSenders,
} from '../domain/campaign.repository.interface';
import { CampaignSenderSummary } from '../dto/campaign-sender-summary.dto';

const campaignInclude = {
  campaignSenderAccounts: {
    include: {
      senderAccount: {
        include: {
          integration: true,
        },
      },
    },
  },
};

type CampaignWithPrismaIncludes = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

function mapCampaign(campaign: CampaignWithPrismaIncludes): CampaignWithSenders {
  return {
    ...campaign,
    senders: campaign.campaignSenderAccounts.map((csa) => ({
      assignmentStatus: csa.status,
      senderAccountId: csa.senderAccountId,
      fromName: csa.senderAccount.fromName,
      fromEmail: csa.senderAccount.fromEmail,
      senderStatus: csa.senderAccount.status,
      integrationStatus: csa.senderAccount.integration.status as CampaignSenderSummary['integrationStatus'],
    })),
  };
}

@Injectable()
export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCampaignData): Promise<CampaignWithSenders> {
    try {
      const campaign = await this.prisma.campaign.create({
        data: {
          workspaceId: data.workspaceId,
          companyId: data.companyId,
          senderAccountId: data.senderAccountId,
          templateId: data.templateId,
          name: data.name,
          normalizedName: data.normalizedName,
          status: data.status,
          followUpDelayBusinessDays: data.followUpDelayBusinessDays ?? 4,
          
        },
        include: campaignInclude,
      });
      return mapCampaign(campaign);
    } catch (error: any) {
      if (this.isCampaignUniqueConstraintError(error)) {
        throw new CampaignDuplicateNameError(
          data.workspaceId,
          data.companyId,
          data.normalizedName,
        );
      }
      throw error;
    }
  }

  async findById(workspaceId: string, id: string): Promise<CampaignWithSenders | null> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      include: campaignInclude,
    });
    return campaign ? mapCampaign(campaign) : null;
  }

  async findByNormalizedName(
    workspaceId: string,
    companyId: string,
    normalizedName: string,
  ): Promise<CampaignWithSenders | null> {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        workspaceId,
        companyId,
        normalizedName,
      },
      include: campaignInclude,
    });
    return campaign ? mapCampaign(campaign) : null;
  }

  async findManyByWorkspace(workspaceId: string): Promise<CampaignWithSenders[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: campaignInclude,
    });
    return campaigns.map(mapCampaign);
  }

  async updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<CampaignWithSenders | null> {
    const existing = await this.findById(workspaceId, id);
    if (!existing) {
      return null;
    }
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status },
      include: campaignInclude,
    });
    return mapCampaign(campaign);
  }

  async findExistingContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<Set<string>> {
    const existing = await this.prisma.campaignMember.findMany({
      where: {
        workspaceId,
        campaignId,
        personId: { in: contactIds },
      },
      select: { personId: true },
    });
    return new Set(existing.map((r) => r.personId));
  }

  async createContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<CampaignMember[]> {
    await this.prisma.campaignMember.createMany({
      data: contactIds.map((personId) => ({
        workspaceId,
        campaignId,
        personId,
      })),
    });
    return this.prisma.campaignMember.findMany({
      where: { workspaceId, campaignId, personId: { in: contactIds } },
    });
  }

  private isCampaignUniqueConstraintError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) &&
      (error as any)?.code !== 'P2002'
    ) {
      return false;
    }
    const e = error as any;
    // 1. PrismaPg driver-adapter constraint field (Prisma 7 adapter path)
    const driverConstraint =
      e?.meta?.driverAdapterError?.cause?.constraint?.fields ||
      e?.meta?.driverAdapterError?.cause?.constraint;
    if (
      typeof driverConstraint === 'string' &&
      driverConstraint.includes('normalized_name')
    ) {
      return true;
    }
    if (
      Array.isArray(driverConstraint) &&
      driverConstraint.includes('normalized_name')
    ) {
      return true;
    }
    // 2. Standard Prisma meta.target field
    const target = e?.meta?.target;
    if (Array.isArray(target) && target.includes('normalized_name')) {
      return true;
    }
    if (typeof target === 'string' && target.includes('normalized_name')) {
      return true;
    }
    // 3. Fallback: if P2002 has no target info (driver adapter edge case), treat as potential campaign collision
    if (!target && !driverConstraint && e?.code === 'P2002') {
      return true;
    }
    return false;
  }
}
