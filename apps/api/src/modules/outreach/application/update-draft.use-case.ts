import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutreachDto } from '@repo/shared';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';

export interface UpdateDraftCommand {
  workspaceId: string;
  outreachId: string;
  subject?: string;
  message?: string;
  expectedUpdatedAt?: string | Date;
}

@Injectable()
export class UpdateDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: UpdateDraftCommand): Promise<OutreachDto> {
    const { workspaceId, outreachId, subject, message, expectedUpdatedAt } = command;

    if (subject === undefined && message === undefined) {
      throw new AppValidationException(
        'At least one of subject or message must be provided',
      );
    }

    if (subject !== undefined && subject.trim().length === 0) {
      throw new AppValidationException('Subject cannot be empty');
    }

    if (message !== undefined && message.trim().length === 0) {
      throw new AppValidationException('Message cannot be empty');
    }

    return await this.prisma.$transaction(async (tx: any) => {
      const outreach = await tx.outreach.findFirst({
        where: { id: outreachId, workspaceId },
      });

      if (!outreach) {
        throw new AppNotFoundException(`Outreach ${outreachId} not found`);
      }

      if (outreach.status !== 'DRAFT') {
        throw new AppConflictException(
          `Cannot edit outreach in ${outreach.status} status. Only DRAFT outreaches can be edited.`,
        );
      }

      if (expectedUpdatedAt) {
        const expectedIso = new Date(expectedUpdatedAt).toISOString();
        const currentIso = outreach.updatedAt.toISOString();
        if (expectedIso !== currentIso) {
          throw new AppConflictException(
            'Concurrent update detected; edit aborted.',
          );
        }
      }

      const updated = await tx.outreach.update({
        where: { id: outreachId },
        data: {
          ...(subject !== undefined ? { subject: subject.trim() } : {}),
          ...(message !== undefined ? { message: message.trim() } : {}),
          ...(outreach.contentSource === 'AI' && outreach.aiGenerationStatus === 'PENDING'
            ? { aiGenerationStatus: 'SKIPPED' }
            : {}),
          draftVersion: { increment: 1 },
        },
      });

      return {
        id: updated.id,
        workspaceId: updated.workspaceId,
        personCompanyAssociationId: updated.personCompanyAssociationId,
        campaignRecipientId: updated.campaignRecipientId,
        senderAccountId: updated.senderAccountId,
        contentSource: updated.contentSource,
        templateId: updated.templateId,
        aiPromptContext: updated.aiPromptContext,
        aiGenerationStatus: updated.aiGenerationStatus ?? null,
        draftVersion: updated.draftVersion,
        subject: updated.subject,
        message: updated.message,
        outreachReason: updated.outreachReason,
        status: updated.status,
        maxFollowUps: updated.maxFollowUps,
        createdAt: updated.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: updated.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }
}
