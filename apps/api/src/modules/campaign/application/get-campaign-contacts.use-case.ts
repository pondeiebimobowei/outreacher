import { Injectable } from '@nestjs/common';
import { CampaignMemberStatus } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface CampaignContactSummaryDto {
  id: string;
  workspaceId: string;
  campaignId: string;
  personId: string;
  status: CampaignMemberStatus;
  targetRole: string | null;
  outreachReason: string | null;
  currentSubject: string | null;
  currentBody: string | null;
  selectedOpportunityId: string | null;
  createdAt: Date;
  updatedAt: Date;
  person: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    personKind: 'PERSON' | 'ROLE_ADDRESS';
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
    const campaignMembers = await this.prisma.campaignMember.findMany({
      where: { workspaceId, campaignId },
      include: {
        person: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return campaignMembers.map((cc) => ({
      id: cc.id,
      workspaceId: cc.workspaceId,
      campaignId: cc.campaignId,
      personId: cc.personId,
      status: cc.status,
      targetRole: cc.targetRole,
      outreachReason: cc.outreachReason,
      currentSubject: cc.currentSubject,
      currentBody: cc.currentBody,
      selectedOpportunityId: cc.selectedOpportunityId,
      createdAt: cc.createdAt,
      updatedAt: cc.updatedAt,
      person: {
        id: cc.person.id,
        name: `${cc.person.firstName} ${cc.person.lastName}`,
        title: cc.person.title,
        email: cc.person.email,
        personKind: cc.person.personKind,
        confidence: cc.person.confidence,
      },
    }));
  }
}
