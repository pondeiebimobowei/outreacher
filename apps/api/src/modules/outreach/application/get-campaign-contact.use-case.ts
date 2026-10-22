import { Injectable } from '@nestjs/common';
import { CampaignMemberStatus } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface GetCampaignContactCommand {
  workspaceId: string;
  campaignMemberId: string;
}

export interface CampaignContactEvidenceDto {
  id: string;
  claim: string;
  classification: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceExcerpt?: string | null;
  confidence?: string | null;
}

export interface EmailSendSummaryResult {
  id: string;
  status: string;
  sentAt?: Date | null;
  failedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface CampaignContactDetailsResult {
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
    firstName: string;
    lastName: string;
    title: string | null;
    email: string | null;
    personKind: 'PERSON' | 'ROLE_ADDRESS';
    confidence: string | null;
    emailConfidence: 'AVAILABLE' | 'UNAVAILABLE';
  };
  campaign: {
    id: string;
    name: string;
    status: string;
    companyId: string;
  };
  selectedOpportunity: {
    id: string;
    roleTitle: string | null;
    opportunityType: string;
  } | null;
  evidence: CampaignContactEvidenceDto[];
  generationJob: {
    id: string;
    status: string;
    createdAt: Date;
    completedAt?: Date | null;
    lastError?: string | null;
  } | null;
  latestEmailSend: EmailSendSummaryResult | null;
}

@Injectable()
export class GetCampaignContactUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    command: GetCampaignContactCommand,
  ): Promise<CampaignContactDetailsResult> {
    const { workspaceId, campaignMemberId } = command;

    const campaignMember = await this.prisma.campaignMember.findUnique({
      where: { id: campaignMemberId },
      include: {
        person: true,
        campaign: {
          include: {
            company: true,
          },
        },
        selectedOpportunity: true,
      },
    });

    if (!campaignMember || campaignMember.workspaceId !== workspaceId) {
      throw new AppNotFoundException('CampaignMember');
    }

    const companyId = campaignMember.campaign.companyId;

    // Fetch evidence items associated with this company
    const evidenceList = await this.prisma.evidence.findMany({
      where: {
        workspaceId,
        companyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Query latest OUTREACH_GENERATION job for this campaignMemberId
    const latestJob = await this.prisma.job.findFirst({
      where: {
        workspaceId,
        type: 'OUTREACH_GENERATION',
        payload: {
          path: ['campaignMemberId'],
          equals: campaignMemberId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Query latest EmailSend for this campaignMemberId
    const latestEmailSend = await this.prisma.emailSend.findFirst({
      where: {
        workspaceId,
        campaignMemberId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: campaignMember.id,
      workspaceId: campaignMember.workspaceId,
      campaignId: campaignMember.campaignId,
      personId: campaignMember.personId,
      status: campaignMember.status,
      targetRole: campaignMember.targetRole,
      outreachReason: campaignMember.outreachReason,
      currentSubject: campaignMember.currentSubject,
      currentBody: campaignMember.currentBody,
      selectedOpportunityId: campaignMember.selectedOpportunityId,
      createdAt: campaignMember.createdAt,
      updatedAt: campaignMember.updatedAt,
      person: {
        id: campaignMember.person.id,
        firstName: campaignMember.person.firstName,
        lastName: campaignMember.person.lastName,
        title: campaignMember.person.title,
        email: campaignMember.person.email,
        personKind: campaignMember.person.personKind,
        confidence: campaignMember.person.confidence,
        emailConfidence: campaignMember.person.email
          ? 'AVAILABLE'
          : 'UNAVAILABLE',
      },
      campaign: {
        id: campaignMember.campaign.id,
        name: campaignMember.campaign.name,
        status: campaignMember.campaign.status,
        companyId: campaignMember.campaign.companyId,
      },
      selectedOpportunity: campaignMember.selectedOpportunity
        ? {
            id: campaignMember.selectedOpportunity.id,
            roleTitle: campaignMember.selectedOpportunity.roleTitle,
            opportunityType:
              campaignMember.selectedOpportunity.opportunityType,
          }
        : null,
      evidence: evidenceList.map((e) => ({
        id: e.id,
        claim: e.claim,
        classification: e.classification,
        sourceName: e.sourceName,
        sourceUrl: e.sourceUrl,
        sourceExcerpt: e.sourceExcerpt,
        confidence: e.confidence,
      })),
      generationJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            createdAt: latestJob.createdAt,
            completedAt: latestJob.completedAt,
            lastError: latestJob.lastError,
          }
        : null,
      latestEmailSend: latestEmailSend
        ? {
            id: latestEmailSend.id,
            status: latestEmailSend.status,
            sentAt: latestEmailSend.sentAt,
            failedAt: latestEmailSend.failedAt,
            errorCode: latestEmailSend.errorCode,
            errorMessage: latestEmailSend.errorMessage,
          }
        : null,
    };
  }
}
