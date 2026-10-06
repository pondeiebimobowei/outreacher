import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutreachDto } from '@repo/shared';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetOutreachUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    outreachId: string,
  ): Promise<OutreachDto & { emailSends?: any[] }> {
    const outreach = await this.prisma.outreach.findFirst({
      where: {
        id: outreachId,
        workspaceId,
      },
      include: {
        personCompanyAssociation: {
          include: {
            person: true,
            company: true,
          },
        },
        emailSends: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!outreach) {
      throw new AppNotFoundException(`Outreach ${outreachId} not found`);
    }

    const pca = outreach.personCompanyAssociation;

    return {
      id: outreach.id,
      workspaceId: outreach.workspaceId,
      personCompanyAssociationId: outreach.personCompanyAssociationId,
      campaignRecipientId: outreach.campaignRecipientId,
      senderAccountId: outreach.senderAccountId,
      contentSource: outreach.contentSource,
      templateId: outreach.templateId,
      aiPromptContext: outreach.aiPromptContext,
      aiGenerationStatus: outreach.aiGenerationStatus ?? null,
      draftVersion: outreach.draftVersion,
      subject: outreach.subject,
      message: outreach.message,
      outreachReason: outreach.outreachReason,
      status: outreach.status,
      maxFollowUps: outreach.maxFollowUps,
      emailSends: outreach.emailSends,
      person: pca
        ? {
            id: pca.person.id,
            firstName: pca.person.firstName,
            lastName: pca.person.lastName,
            title: pca.person.title,
            email: pca.person.email,
            personKind: pca.person.personKind,
            confidence: pca.person.confidence,
          }
        : undefined,
      company: pca
        ? {
            id: pca.company.id,
            name: pca.company.name,
          }
        : undefined,
      createdAt: outreach.createdAt.toISOString(),
      updatedAt: outreach.updatedAt.toISOString(),
    };
  }
}
