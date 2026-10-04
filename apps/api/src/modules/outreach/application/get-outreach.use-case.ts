import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@repo/db';
import { OutreachDto } from '@repo/shared';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetOutreachUseCase {
  constructor(private readonly prisma: PrismaClient) {}

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
        emailSends: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!outreach) {
      throw new AppNotFoundException(`Outreach ${outreachId} not found`);
    }

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
      createdAt: outreach.createdAt.toISOString(),
      updatedAt: outreach.updatedAt.toISOString(),
    };
  }
}
