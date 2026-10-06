import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CampaignRecipientSummaryDto } from '@repo/shared';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetCampaignRecipientsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignRecipientSummaryDto[]> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: {
        campaignSenderAccounts: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (!campaign) {
      throw new AppNotFoundException('Campaign');
    }

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { workspaceId, campaignId },
      include: {
        personCompanyAssociation: {
          include: {
            person: true,
            company: true,
          },
        },
        outreach: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const defaultSenderAccountId =
      campaign.campaignSenderAccounts[0]?.senderAccountId ?? null;

    // Ensure every enrolled recipient has a 1:1 Outreach record initialized
    for (const recipient of recipients) {
      if (!recipient.outreach) {
        let initialSubject = '';
        let initialMessage = '';

        if (campaign.contentSource === 'TEMPLATE' && campaign.templateId) {
          const step0 = await this.prisma.emailTemplateStep.findFirst({
            where: { templateId: campaign.templateId, sequence: 0 },
          });
          if (step0) {
            initialSubject = step0.subjectTemplate
              .replace(
                /\{\{\s*contact\.firstName\s*\}\}/g,
                recipient.personCompanyAssociation.person.firstName ?? '',
              )
              .replace(
                /\{\{\s*contact\.lastName\s*\}\}/g,
                recipient.personCompanyAssociation.person.lastName ?? '',
              )
              .replace(
                /\{\{\s*company\.name\s*\}\}/g,
                recipient.personCompanyAssociation.company.name ?? '',
              );
            initialMessage = step0.bodyTemplate
              .replace(
                /\{\{\s*contact\.firstName\s*\}\}/g,
                recipient.personCompanyAssociation.person.firstName ?? '',
              )
              .replace(
                /\{\{\s*contact\.lastName\s*\}\}/g,
                recipient.personCompanyAssociation.person.lastName ?? '',
              )
              .replace(
                /\{\{\s*company\.name\s*\}\}/g,
                recipient.personCompanyAssociation.company.name ?? '',
              );
          }
        }

        const createdOutreach = await this.prisma.outreach.create({
          data: {
            workspaceId,
            personCompanyAssociationId: recipient.personCompanyAssociationId,
            campaignRecipientId: recipient.id,
            senderAccountId: defaultSenderAccountId,
            contentSource: campaign.contentSource,
            templateId: campaign.templateId,
            aiPromptContext: campaign.aiPromptContext,
            aiGenerationStatus:
              campaign.contentSource === 'AI' ? 'PENDING' : null,
            status: 'DRAFT',
            draftVersion: 1,
            subject: initialSubject,
            message: initialMessage,
            maxFollowUps: campaign.maxFollowUps,
          },
        });
        (recipient as any).outreach = createdOutreach;
      }
    }

    return recipients.map((r: any) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      campaignId: r.campaignId,
      personCompanyAssociationId: r.personCompanyAssociationId,
      status: r.status,
      targetRole: r.targetRole,
      selectedOpportunityId: r.selectedOpportunityId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      outreachId: r.outreach?.id ?? null,
      outreach: r.outreach
        ? {
            id: r.outreach.id,
            status: r.outreach.status,
            subject: r.outreach.subject,
            message: r.outreach.message,
            aiGenerationStatus: r.outreach.aiGenerationStatus ?? null,
          }
        : null,
      person: {
        id: r.personCompanyAssociation.person.id,
        firstName: r.personCompanyAssociation.person.firstName,
        lastName: r.personCompanyAssociation.person.lastName,
        title: r.personCompanyAssociation.person.title,
        email: r.personCompanyAssociation.person.email,
        personKind: r.personCompanyAssociation.person.personKind,
        confidence: r.personCompanyAssociation.person.confidence,
      },
    }));
  }
}
