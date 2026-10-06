import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CampaignRecipientDto } from '@repo/shared';
import {
  AppForbiddenException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { AddCampaignRecipientsDto } from '../dto/add-campaign-recipients.dto';

@Injectable()
export class AddCampaignRecipientsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    workspaceId: string,
    campaignId: string,
    dto: AddCampaignRecipientsDto,
  ): Promise<CampaignRecipientDto[]> {
    if (!dto.recipients || dto.recipients.length === 0) {
      throw new AppValidationException('At least one recipient is required');
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        workspaceId,
      },
    });

    if (!campaign) {
      throw new AppNotFoundException(`Campaign ${campaignId} not found`);
    }

    const pcaIds = dto.recipients.map((r) => r.personCompanyAssociationId);
    const pcas = await this.prisma.personCompanyAssociation.findMany({
      where: {
        id: { in: pcaIds },
      },
    });

    for (const pca of pcas) {
      if (pca.workspaceId !== workspaceId) {
        throw new AppForbiddenException(
          `PersonCompanyAssociation ${pca.id} does not belong to this workspace`,
        );
      }
    }

    if (pcas.length !== pcaIds.length) {
      throw new AppNotFoundException('One or more contact associations not found');
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.campaignRecipient.createMany({
        data: dto.recipients.map((r) => ({
          workspaceId,
          campaignId,
          personCompanyAssociationId: r.personCompanyAssociationId,
          targetRole: r.targetRole ?? null,
          selectedOpportunityId: r.selectedOpportunityId ?? null,
          status: 'PENDING',
        })),
      });

      const recipients = await tx.campaignRecipient.findMany({
        where: {
          campaignId,
          personCompanyAssociationId: { in: pcaIds },
        },
      });

      return recipients.map((r: any) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        campaignId: r.campaignId,
        personCompanyAssociationId: r.personCompanyAssociationId,
        status: r.status,
        targetRole: r.targetRole,
        selectedOpportunityId: r.selectedOpportunityId,
        createdAt: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: r.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      }));
    });
  }
}
