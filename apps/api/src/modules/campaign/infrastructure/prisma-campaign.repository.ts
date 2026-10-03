import { Injectable } from '@nestjs/common';
import { Campaign, CampaignRecipient, CampaignStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CampaignDuplicateNameError,
  CreateCampaignData,
  ICampaignRepository,
  CampaignWithSenders,
} from '../domain/campaign.repository.interface';

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

type CampaignWithPrismaIncludes = Prisma.CampaignGetPayload<{
  include: typeof campaignInclude;
}>;

function mapCampaign(
  campaign: CampaignWithPrismaIncludes,
): CampaignWithSenders {
  return {
    ...campaign,
    senders: campaign.campaignSenderAccounts.map((csa) => ({
      assignmentStatus: csa.status,
      senderAccountId: csa.senderAccountId,
      fromName: csa.senderAccount.fromName,
      fromEmail: csa.senderAccount.fromEmail,
      senderStatus: csa.senderAccount.status,
      integrationStatus: csa.senderAccount.integration.status,
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
          name: data.name,
          status: data.status,
          contentSource: data.contentSource ?? 'TEMPLATE',
          templateId: data.templateId ?? null,
          aiPromptContext: data.aiPromptContext ?? null,
          followUpDelayBusinessDays: data.followUpDelayBusinessDays ?? 3,
          maxFollowUps: data.maxFollowUps ?? 2,
        },
        include: campaignInclude,
      });
      return mapCampaign(campaign);
    } catch (error: any) {
      if (this.isCampaignUniqueConstraintError(error)) {
        throw new CampaignDuplicateNameError(
          data.workspaceId,
          data.name,
        );
      }
      throw error;
    }
  }

  async findById(
    workspaceId: string,
    id: string,
  ): Promise<CampaignWithSenders | null> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      include: campaignInclude,
    });
    return campaign ? mapCampaign(campaign) : null;
  }

  async findByName(
    workspaceId: string,
    name: string,
  ): Promise<CampaignWithSenders | null> {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        workspaceId,
        name,
      },
      include: campaignInclude,
    });
    return campaign ? mapCampaign(campaign) : null;
  }

  async findManyByWorkspace(
    workspaceId: string,
  ): Promise<CampaignWithSenders[]> {
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

  async createRecipientBindings(
    workspaceId: string,
    campaignId: string,
    pcaIds: string[],
  ): Promise<CampaignRecipient[]> {
    await this.prisma.campaignRecipient.createMany({
      data: pcaIds.map((pcaId) => ({
        workspaceId,
        campaignId,
        personCompanyAssociationId: pcaId,
        status: 'PENDING',
      })),
    });
    return this.prisma.campaignRecipient.findMany({
      where: { workspaceId, campaignId, personCompanyAssociationId: { in: pcaIds } },
    });
  }

  private isCampaignUniqueConstraintError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) &&
      (error as any)?.code !== 'P2002'
    ) {
      return false;
    }
    return true;
  }
}
