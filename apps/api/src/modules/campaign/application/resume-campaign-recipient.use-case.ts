import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ResumeCampaignRecipientUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    campaignId: string,
    recipientId: string,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Fetch recipient with PCA & Person
      const recipient = await tx.campaignRecipient.findFirst({
        where: {
          id: recipientId,
          campaignId,
          workspaceId,
        },
        include: {
          personCompanyAssociation: {
            include: { person: true },
          },
        },
      });

      if (!recipient) {
        throw new NotFoundException(
          `Campaign recipient ${recipientId} not found in campaign ${campaignId}`,
        );
      }

      // 2. Lock Campaign -> CampaignRecipient -> PCA
      await tx.$queryRaw`
        SELECT id FROM campaigns
        WHERE id = ${campaignId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT id FROM campaign_recipients
        WHERE id = ${recipientId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT id FROM person_company_associations
        WHERE id = ${recipient.personCompanyAssociationId}
          AND workspace_id = ${workspaceId}
        FOR UPDATE
      `;

      const pca = recipient.personCompanyAssociation;

      // 3. Check PCA conversationState is NO_REPLY
      if (pca.conversationState !== 'NO_REPLY') {
        throw new ConflictException(
          `Cannot resume campaign recipient: Contact relationship state is ${pca.conversationState}. Expected NO_REPLY.`,
        );
      }

      // 4. Check if email is currently suppressed
      const email = pca.workEmail || pca.person?.email;
      if (email) {
        const suppression = await tx.suppression.findUnique({
          where: {
            workspaceId_email: {
              workspaceId,
              email: email.trim().toLowerCase(),
            },
          },
        });

        if (suppression) {
          throw new ConflictException(
            `Cannot resume campaign recipient: Contact email ${email} is suppressed in this workspace.`,
          );
        }
      }

      // 5. Transition CampaignRecipient.status: SUPPRESSED -> PENDING
      const updated = await tx.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'PENDING' },
      });

      return {
        id: updated.id,
        status: updated.status,
      };
    });
  }
}
