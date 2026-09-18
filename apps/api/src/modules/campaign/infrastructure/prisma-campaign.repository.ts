import { Injectable } from '@nestjs/common';
import { Campaign, CampaignStatus } from '@repo/db';
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
}
