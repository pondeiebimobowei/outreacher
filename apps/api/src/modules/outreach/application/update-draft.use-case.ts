import { Injectable } from '@nestjs/common';
import { CampaignContact, CampaignContactStatus, Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface UpdateDraftCommand {
  workspaceId: string;
  campaignContactId: string;
  subject?: string;
  bodyText?: string;
}

@Injectable()
export class UpdateDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: UpdateDraftCommand): Promise<CampaignContact> {
    const { workspaceId, campaignContactId, subject, bodyText } = command;

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
        const campaignContact = await tx.campaignContact.findUnique({
          where: { id: campaignContactId },
        });

        if (!campaignContact || campaignContact.workspaceId !== workspaceId) {
          throw new AppNotFoundException(
            `CampaignContact ${campaignContactId} not found`,
          );
        }

        const allowedStatuses: CampaignContactStatus[] = ['PENDING', 'READY'];
        if (!allowedStatuses.includes(campaignContact.status)) {
          throw new AppConflictException(
            `Cannot edit draft for contact in ${campaignContact.status} status`,
          );
        }

        // Partial PATCH semantics: omitted fields retain existing values
        const updatedSubject =
          trimmedSubject !== undefined
            ? trimmedSubject
            : campaignContact.currentSubject;
        const updatedBody =
          trimmedBodyText !== undefined
            ? trimmedBodyText
            : campaignContact.currentBody;

        const updatedContact = await tx.campaignContact.update({
          where: { id: campaignContactId },
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
