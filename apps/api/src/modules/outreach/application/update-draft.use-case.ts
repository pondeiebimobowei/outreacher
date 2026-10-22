import { Injectable } from '@nestjs/common';
import { CampaignMember, CampaignMemberStatus, Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface UpdateDraftCommand {
  workspaceId: string;
  campaignMemberId: string;
  subject?: string;
  bodyText?: string;
  expectedUpdatedAt?: string | Date;
}

@Injectable()
export class UpdateDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: UpdateDraftCommand): Promise<CampaignMember> {
    const {
      workspaceId,
      campaignMemberId,
      subject,
      bodyText,
      expectedUpdatedAt,
    } = command;

    // 1. Double-Layer Domain Validation (Input Normalization & Boundary Guards)
    const trimmedSubject =
      typeof subject === 'string' ? subject.trim() : subject;
    const trimmedBodyText =
      typeof bodyText === 'string' ? bodyText.trim() : bodyText;

    if (trimmedSubject === undefined && trimmedBodyText === undefined) {
      throw new AppValidationException(
        'At least one of subject or bodyText must be provided',
      );
    }

    if (trimmedSubject !== undefined) {
      if (trimmedSubject.length < 3 || trimmedSubject.length > 150) {
        throw new AppValidationException(
          'Subject must be between 3 and 150 characters',
        );
      }
    }

    if (trimmedBodyText !== undefined) {
      if (trimmedBodyText.length < 20 || trimmedBodyText.length > 4000) {
        throw new AppValidationException(
          'Body text must be between 20 and 4000 characters',
        );
      }
    }

    // 2. Transactional Execution & State Machine Enforcement (Model B: READY -> edit -> PENDING)
    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const campaignMember = await tx.campaignMember.findUnique({
          where: { id: campaignMemberId },
        });

        if (!campaignMember || campaignMember.workspaceId !== workspaceId) {
          throw new AppNotFoundException(
            `CampaignMember ${campaignMemberId} not found`,
          );
        }

        // Optimistic concurrency verification
        if (expectedUpdatedAt) {
          const expectedIso = new Date(expectedUpdatedAt).toISOString();
          const currentIso = campaignMember.updatedAt.toISOString();
          if (expectedIso !== currentIso) {
            throw new AppConflictException(
              'Concurrent update detected; draft was modified by another session.',
            );
          }
        }

        const allowedStatuses: CampaignMemberStatus[] = ['PENDING', 'READY'];
        if (!allowedStatuses.includes(campaignMember.status)) {
          throw new AppConflictException(
            `Cannot edit draft for contact in ${campaignMember.status} status`,
          );
        }

        // Partial PATCH semantics: omitted fields retain existing values
        const updatedSubject =
          trimmedSubject !== undefined
            ? trimmedSubject
            : campaignMember.currentSubject;
        const updatedBody =
          trimmedBodyText !== undefined
            ? trimmedBodyText
            : campaignMember.currentBody;

        const updatedContact = await tx.campaignMember.update({
          where: { id: campaignMemberId },
          data: {
            currentSubject: updatedSubject,
            currentBody: updatedBody,
            status: 'PENDING', // Model B invariant: editing always resets status to PENDING
          },
        });

        return updatedContact;
      },
    );
  }
}
