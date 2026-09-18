import { Injectable } from '@nestjs/common';
import { CampaignContact, Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface ApproveDraftCommand {
  workspaceId: string;
  campaignContactId: string;
}

@Injectable()
export class ApproveDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: ApproveDraftCommand): Promise<CampaignContact> {
    const { workspaceId, campaignContactId } = command;

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Fetch current contact with its relation to the actual contact (for email)
        const campaignContact = await tx.campaignContact.findUnique({
          where: { id: campaignContactId },
          include: { contact: true },
        });

        if (!campaignContact || campaignContact.workspaceId !== workspaceId) {
          throw new AppNotFoundException(
            `CampaignContact ${campaignContactId} not found`,
          );
        }

        if (
          campaignContact.status !== 'PENDING' &&
          campaignContact.status !== 'READY'
        ) {
          throw new AppConflictException(
            `Cannot approve draft for contact in ${campaignContact.status} status`,
          );
        }

        // 2. Extract and normalize email
        const rawEmail = campaignContact.contact?.email;
        if (!rawEmail) {
          throw new AppValidationException(
            'Cannot approve contact without a recipient email',
          );
        }
        const canonicalEmail = rawEmail.trim().toLowerCase();

        // 3. Check Suppression
        const suppression = await tx.suppression.findUnique({
          where: {
            workspaceId_email: {
              workspaceId,
              email: canonicalEmail,
            },
          },
        });

        if (suppression) {
          throw new AppConflictException('Recipient email is suppressed');
        }

        // 4. Handle READY -> READY (Idempotent Path)
        if (campaignContact.status === 'READY') {
          // Remove the included contact relation to match standard return type
          const { contact: _contact, ...contactData } = campaignContact;
          return contactData;
        }

        // 5. Handle PENDING -> READY (Validation & Optimistic Concurrency)
        const { currentSubject, currentBody } = campaignContact;

        if (
          !currentSubject ||
          currentSubject.length < 3 ||
          currentSubject.length > 150
        ) {
          throw new AppValidationException(
            'Cannot approve contact: subject must be between 3 and 150 characters',
          );
        }

        if (
          !currentBody ||
          currentBody.length < 20 ||
          currentBody.length > 4000
        ) {
          throw new AppValidationException(
            'Cannot approve contact: body must be between 20 and 4000 characters',
          );
        }

        // Optimistic Concurrency Update
        const updateResult = await tx.campaignContact.updateMany({
          where: {
            id: campaignContactId,
            updatedAt: campaignContact.updatedAt,
            status: 'PENDING',
          },
          data: {
            status: 'READY',
          },
        });

        if (updateResult.count === 0) {
          throw new AppConflictException(
            'Concurrent update detected; approval aborted.',
          );
        }

        // Fetch the updated record to get the exact DB timestamp and return standard model
        const updatedContact = await tx.campaignContact.findUnique({
          where: { id: campaignContactId },
        });

        return updatedContact!;
      },
    );
  }
}
