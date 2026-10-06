import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { OutreachDto } from '@repo/shared';
import {
  AppConflictException,
  AppNotFoundException,
  AppUnprocessableEntityException,
  AppValidationException,
} from '../../../common/errors/application.exception';

export interface ApproveDraftCommand {
  workspaceId: string;
  outreachId: string;
  expectedUpdatedAt?: string | Date;
}

@Injectable()
export class ApproveDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: ApproveDraftCommand): Promise<OutreachDto> {
    const { workspaceId, outreachId, expectedUpdatedAt } = command;

    return await this.prisma.$transaction(async (tx: any) => {
      const outreach = await tx.outreach.findFirst({
        where: { id: outreachId, workspaceId },
      });

      if (!outreach) {
        throw new AppNotFoundException(`Outreach ${outreachId} not found`);
      }

      if (outreach.status !== 'DRAFT') {
        throw new AppConflictException(
          `Cannot approve outreach in ${outreach.status} status. Only DRAFT outreaches can be approved.`,
        );
      }

      if (expectedUpdatedAt) {
        const expectedIso = new Date(expectedUpdatedAt).toISOString();
        const currentIso = outreach.updatedAt.toISOString();
        if (expectedIso !== currentIso) {
          throw new AppConflictException(
            'Concurrent update detected; approval aborted.',
          );
        }
      }

      if (!outreach.subject || outreach.subject.trim().length === 0) {
        throw new AppValidationException('Subject must not be empty to approve draft');
      }

      if (!outreach.message || outreach.message.trim().length === 0) {
        throw new AppValidationException('Message must not be empty to approve draft');
      }

      const pca = await tx.personCompanyAssociation.findUnique({
        where: { id: outreach.personCompanyAssociationId },
        include: { person: true },
      });
      if (pca) {
        if (pca.conversationState === 'STOPPED') {
          throw new AppUnprocessableEntityException('Contact is suppressed/stopped');
        }
        const email = pca.workEmail || pca.person?.email;
        if (email) {
          const suppressed = await tx.suppression.findFirst({
            where: {
              workspaceId,
              email: email.trim().toLowerCase(),
            },
          });
          if (suppressed) {
            throw new AppUnprocessableEntityException('Contact is suppressed/stopped');
          }
        }
      }

      const updated = await tx.outreach.update({
        where: { id: outreachId },
        data: {
          status: 'APPROVED',
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
        aiGenerationStatus: updated.aiGenerationStatus,
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
