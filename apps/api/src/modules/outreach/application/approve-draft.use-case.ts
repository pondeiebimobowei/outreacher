import { Injectable } from '@nestjs/common';
import { CampaignMember, Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface ApproveDraftCommand {
  workspaceId: string;
  campaignMemberId: string;
  expectedUpdatedAt?: string | Date;
}

@Injectable()
export class ApproveDraftUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: ApproveDraftCommand): Promise<CampaignMember> {
    const { workspaceId, campaignMemberId, expectedUpdatedAt } = command;

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Fetch current contact with its relation to the actual contact (for email)
        const campaignMember = await tx.campaignMember.findUnique({
          where: { id: campaignMemberId },
          include: { person: true },
        });

        if (!campaignMember || campaignMember.workspaceId !== workspaceId) {
          throw new AppNotFoundException(
            `CampaignMember ${campaignMemberId} not found`,
          );
        }

        // Optimistic concurrency verification if token provided
        if (expectedUpdatedAt) {
          const expectedIso = new Date(expectedUpdatedAt).toISOString();
          const currentIso = campaignMember.updatedAt.toISOString();
          if (expectedIso !== currentIso) {
            throw new AppConflictException(
              'Concurrent update detected; approval aborted.',
            );
          }
        }

        if (
          campaignMember.status !== 'PENDING' &&
          campaignMember.status !== 'READY'
        ) {
          throw new AppConflictException(
            `Cannot approve draft for contact in ${campaignMember.status} status`,
          );
        }

        // 2. Extract and normalize email
        const rawEmail = campaignMember.person?.email;
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
        if (campaignMember.status === 'READY') {
          // Remove the included contact relation to match standard return type
          const { person: _contact, ...contactData } = campaignMember;
          return contactData;
        }

        // 5. Handle PENDING -> READY (Validation & Optimistic Concurrency)
        const { currentSubject, currentBody } = campaignMember;

        if (
          !currentSubject ||
          currentSubject.length < 3 ||
          currentSubject.length > 150
        ) {
          throw new AppValidationException(
            'Cannot approve person: subject must be between 3 and 150 characters',
          );
        }

        if (
          !currentBody ||
          currentBody.length < 20 ||
          currentBody.length > 4000
        ) {
          throw new AppValidationException(
            'Cannot approve person: body must be between 20 and 4000 characters',
          );
        }

        // Optimistic Concurrency Update
        const updateResult = await tx.campaignMember.updateMany({
          where: {
            id: campaignMemberId,
            updatedAt: campaignMember.updatedAt,
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
        const updatedContact = await tx.campaignMember.findUnique({
          where: { id: campaignMemberId },
        });

        return updatedContact!;
      },
    );
  }
}
