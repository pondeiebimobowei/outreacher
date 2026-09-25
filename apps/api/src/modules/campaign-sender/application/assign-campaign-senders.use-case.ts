import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { AssignSendersDto } from '../dto/assign-senders.dto';
import {
  AppValidationException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { AssignmentStatus } from '@repo/db';

@Injectable()
export class AssignCampaignSendersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(
    workspaceId: string,
    campaignId: string,
    dto: AssignSendersDto,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { workspaceId_id: { workspaceId, id: campaignId } },
    });

    if (!campaign) {
      throw new AppNotFoundException('Campaign not found');
    }

    if (campaign.status === 'ARCHIVED' || campaign.status === 'COMPLETED') {
      throw new AppValidationException(
        `Cannot assign senders to a campaign in ${campaign.status} status`,
      );
    }

    const uniqueSenderIds = [...new Set(dto.senderAccountIds)];

    if (uniqueSenderIds.length > 0) {
      const senders = await this.prisma.senderAccount.findMany({
        where: {
          workspaceId,
          id: { in: uniqueSenderIds },
        },
        select: { id: true },
      });

      if (senders.length !== uniqueSenderIds.length) {
        throw new AppValidationException(
          'One or more sender accounts do not exist in this workspace',
        );
      }
    }

    // Wrap in $transaction for all-or-nothing transactional replacement
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Mark existing ACTIVE assigned senders not in the new list as REMOVED
      if (uniqueSenderIds.length > 0) {
        await tx.campaignSenderAccount.updateMany({
          where: {
            workspaceId,
            campaignId,
            senderAccountId: { notIn: uniqueSenderIds },
            status: AssignmentStatus.ACTIVE,
          },
          data: { status: AssignmentStatus.REMOVED },
        });
      } else {
        // Empty set → remove all active
        await tx.campaignSenderAccount.updateMany({
          where: {
            workspaceId,
            campaignId,
            status: AssignmentStatus.ACTIVE,
          },
          data: { status: AssignmentStatus.REMOVED },
        });
      }

      // 2. Upsert each provided sender ID to ACTIVE
      for (const senderAccountId of uniqueSenderIds) {
        const existing = await tx.campaignSenderAccount.findFirst({
          where: { workspaceId, campaignId, senderAccountId },
        });

        if (existing) {
          // Reactivate if previously REMOVED (idempotent if already ACTIVE)
          if (existing.status !== AssignmentStatus.ACTIVE) {
            await tx.campaignSenderAccount.update({
              where: { id: existing.id },
              data: { status: AssignmentStatus.ACTIVE },
            });
          }
        } else {
          await tx.campaignSenderAccount.create({
            data: {
              workspaceId,
              campaignId,
              senderAccountId,
              status: AssignmentStatus.ACTIVE,
            },
          });
        }
      }

      return { success: true };
    });
  }
}
