import { Injectable } from '@nestjs/common';
import { CampaignContactStatus } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface CampaignContactSummaryDto {
  id: string;
  workspaceId: string;
  campaignId: string;
  contactId: string;
  status: CampaignContactStatus;
  targetRole: string | null;
  outreachReason: string | null;
  currentSubject: string | null;
  currentBody: string | null;
  selectedOpportunityId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    contactKind: 'PERSON' | 'ROLE_ADDRESS';
    confidence: string | null;
  };
}

@Injectable()
export class GetCampaignContactsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignContactSummaryDto[]> {
    // 1. Validate campaign exists in workspace
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });

    if (!campaign) {
      throw new AppNotFoundException('Campaign');
    }

    // 2. Fetch all campaign contacts bound to this campaign
    const campaignContacts = await this.prisma.campaignContact.findMany({
      where: { workspaceId, campaignId },
      include: {
        contact: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return campaignContacts.map((cc) => ({
      id: cc.id,
      workspaceId: cc.workspaceId,
      campaignId: cc.campaignId,
      contactId: cc.contactId,
      status: cc.status,
      targetRole: cc.targetRole,
      outreachReason: cc.outreachReason,
      currentSubject: cc.currentSubject,
      currentBody: cc.currentBody,
      selectedOpportunityId: cc.selectedOpportunityId,
      createdAt: cc.createdAt,
      updatedAt: cc.updatedAt,
      contact: {
        id: cc.contact.id,
        name: cc.contact.name,
        title: cc.contact.title,
        email: cc.contact.email,
        contactKind: cc.contact.contactKind,
        confidence: cc.contact.confidence,
      },
    }));
  }
}
