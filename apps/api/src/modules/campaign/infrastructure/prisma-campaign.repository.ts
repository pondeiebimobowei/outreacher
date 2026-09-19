import { Injectable } from '@nestjs/common';
import { Campaign, CampaignContact, CampaignStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CampaignDuplicateNameError,
  CreateCampaignData,
  ICampaignRepository,
} from '../domain/campaign.repository.interface';

@Injectable()
export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCampaignData): Promise<Campaign> {
    try {
      return await this.prisma.campaign.create({
        data: {
          workspaceId: data.workspaceId,
          companyId: data.companyId,
          name: data.name,
          normalizedName: data.normalizedName,
          sendingIdentity: data.sendingIdentity ?? null,
          followUpDelayBusinessDays: data.followUpDelayBusinessDays ?? 4,
        },
      });
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

  async findById(workspaceId: string, id: string): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
  }

  async findByNormalizedName(
    workspaceId: string,
    companyId: string,
    normalizedName: string,
  ): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({
      where: {
        workspaceId,
        companyId,
        normalizedName,
      },
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
