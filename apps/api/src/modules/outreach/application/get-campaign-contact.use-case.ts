import { Injectable } from '@nestjs/common';
import { CampaignContactStatus } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface GetCampaignContactCommand {
  workspaceId: string;
  campaignContactId: string;
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

export interface CampaignContactDetailsResult {
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
}

@Injectable()
export class GetCampaignContactUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    command: GetCampaignContactCommand,
  ): Promise<CampaignContactDetailsResult> {
    const { workspaceId, campaignContactId } = command;

    const campaignContact = await this.prisma.campaignContact.findUnique({
      where: { id: campaignContactId },
      include: {
        contact: true,
        campaign: {
          include: {
            company: true,
          },
        },
        selectedOpportunity: true,
      },
    });

    if (!campaignContact || campaignContact.workspaceId !== workspaceId) {
      throw new AppNotFoundException('CampaignContact');
    }

    const companyId = campaignContact.campaign.companyId;

    // Fetch evidence items associated with this company
    const evidenceList = await this.prisma.evidence.findMany({
      where: {
        workspaceId,
        companyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Query latest OUTREACH_GENERATION job for this campaignContactId
    const latestJob = await this.prisma.job.findFirst({
      where: {
        workspaceId,
        type: 'OUTREACH_GENERATION',
        payload: {
          path: ['campaignContactId'],
          equals: campaignContactId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: campaignContact.id,
      workspaceId: campaignContact.workspaceId,
      campaignId: campaignContact.campaignId,
      contactId: campaignContact.contactId,
      status: campaignContact.status,
      targetRole: campaignContact.targetRole,
      outreachReason: campaignContact.outreachReason,
      currentSubject: campaignContact.currentSubject,
      currentBody: campaignContact.currentBody,
      selectedOpportunityId: campaignContact.selectedOpportunityId,
      createdAt: campaignContact.createdAt,
      updatedAt: campaignContact.updatedAt,
      contact: {
        id: campaignContact.contact.id,
        name: campaignContact.contact.name,
        title: campaignContact.contact.title,
        email: campaignContact.contact.email,
        contactKind: campaignContact.contact.contactKind,
        confidence: campaignContact.contact.confidence,
        emailConfidence: campaignContact.contact.email
          ? 'AVAILABLE'
          : 'UNAVAILABLE',
      },
      campaign: {
        id: campaignContact.campaign.id,
        name: campaignContact.campaign.name,
        status: campaignContact.campaign.status,
        companyId: campaignContact.campaign.companyId,
      },
      selectedOpportunity: campaignContact.selectedOpportunity
        ? {
            id: campaignContact.selectedOpportunity.id,
            roleTitle: campaignContact.selectedOpportunity.roleTitle,
            opportunityType:
              campaignContact.selectedOpportunity.opportunityType,
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
    };
  }
}
