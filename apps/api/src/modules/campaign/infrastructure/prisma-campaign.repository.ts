import { Injectable } from '@nestjs/common';
import { Campaign, CampaignContact, CampaignStatus } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CreateCampaignData,
  ICampaignRepository,
} from '../domain/campaign.repository.interface';

@Injectable()
export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCampaignData): Promise<Campaign> {
    return this.prisma.campaign.create({
      data: {
        workspaceId: data.workspaceId,
        companyId: data.companyId,
        name: data.name,
        sendingIdentity: data.sendingIdentity ?? null,
        followUpDelayBusinessDays: data.followUpDelayBusinessDays ?? 4,
      },
    });
  }

  async findById(workspaceId: string, id: string): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
  }

  async findManyByWorkspace(workspaceId: string): Promise<Campaign[]> {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<Campaign | null> {
    const existing = await this.findById(workspaceId, id);
    if (!existing) {
      return null;
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
  }

  async findExistingContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<Set<string>> {
    const existing = await this.prisma.campaignContact.findMany({
      where: {
        workspaceId,
        campaignId,
        contactId: { in: contactIds },
      },
      select: { contactId: true },
    });
    return new Set(existing.map((r) => r.contactId));
  }

  async createContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<CampaignContact[]> {
    await this.prisma.campaignContact.createMany({
      data: contactIds.map((contactId) => ({
        workspaceId,
        campaignId,
        contactId,
      })),
    });
    return this.prisma.campaignContact.findMany({
      where: { workspaceId, campaignId, contactId: { in: contactIds } },
    });
  }
}
