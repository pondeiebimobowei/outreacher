import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OutcomeType, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class RecordUserOutcomeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    campaignMemberId: string,
    workspaceId: string,
    userId: string,
    outcomeType: OutcomeType,
    notes?: string,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx : Prisma.TransactionClient) => {
      // 1. Lock CampaignMember FOR UPDATE
      const contacts = await tx.$queryRaw<any[]>`
        SELECT id, workspace_id, status 
        FROM campaign_contacts 
        WHERE id = ${campaignMemberId} 
          AND workspace_id = ${workspaceId} 
        FOR UPDATE
      `;

      if (!contacts || contacts.length === 0) {
        throw new NotFoundException('Campaign contact not found in caller workspace');
      }

      const contact = contacts[0];

      // 2. Inspect status
      if (contact.status !== 'REPLIED') {
        throw new ConflictException(
          `Cannot record outcome for contact in state ${contact.status}. Expected REPLIED.`
        );
      }

      // 3. INSERT Outcome
      const outcome = await tx.outcome.create({
        data: {
          workspaceId,
          campaignMemberId,
          recordedByUserId: userId,
          type: outcomeType,
          notes: notes || null,
        },
      });

      // 4. UPDATE CampaignMember -> COMPLETED
      await tx.campaignMember.update({
        where: { id: campaignMemberId },
        data: { status: 'COMPLETED' },
      });

      return outcome.id;
    });
  }
}
