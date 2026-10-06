import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CampaignDto } from '@repo/shared';
import {
  AppForbiddenException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { CreateCampaignDto } from '../dto/create-campaign.dto';

@Injectable()
export class CreateCampaignUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignDto> {
    if (!dto.name || dto.name.trim() === '') {
      throw new AppValidationException('Campaign name cannot be empty');
    }

    const maxFollowUps = dto.maxFollowUps ?? 2;
    const followUpDelayBusinessDays = dto.followUpDelayBusinessDays ?? 3;
    const status = dto.status ?? 'DRAFT';

    // ContentSource Mutual Exclusion & Invariants
    if (dto.contentSource === 'TEMPLATE') {
      if (!dto.templateId) {
        throw new AppValidationException('TEMPLATE campaign requires templateId');
      }
      if (dto.aiPromptContext) {
        throw new AppValidationException(
          'TEMPLATE campaign must not specify aiPromptContext',
        );
      }
    } else if (dto.contentSource === 'AI') {
      if (dto.templateId) {
        throw new AppValidationException(
          'AI campaign must not specify templateId',
        );
      }
    } else {
      throw new AppValidationException('Invalid contentSource. Must be TEMPLATE or AI');
    }

    let template: any = null;
    if (dto.contentSource === 'TEMPLATE') {
      template = await this.prisma.emailTemplate.findFirst({
        where: { id: dto.templateId!, workspaceId },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      if (!template) {
        throw new AppNotFoundException(`Email template ${dto.templateId} not found`);
      }

      this.templateEngine.validateTemplateForCampaign(template, maxFollowUps);
    }

    // Verify sender accounts
    const senderAccountIds = dto.senderAccountIds ?? [];
    if (senderAccountIds.length > 0) {
      const senders = await this.prisma.senderAccount.findMany({
        where: {
          id: { in: senderAccountIds },
          workspaceId,
        },
      });
      if (senders.length !== senderAccountIds.length) {
        throw new AppForbiddenException(
          'One or more sender accounts do not exist or belong to another workspace',
        );
      }
    }

    // If initial status is ACTIVE, execute Activation Gate
    if (status === 'ACTIVE' && dto.contentSource === 'TEMPLATE') {
      this.templateEngine.validateTemplateForCampaign(template, maxFollowUps);
    }

    return this.prisma.$transaction(async (tx: any) => {
      const campaign = await tx.campaign.create({
        data: {
          workspaceId,
          name: dto.name.trim(),
          status,
          contentSource: dto.contentSource,
          templateId: dto.contentSource === 'TEMPLATE' ? dto.templateId : null,
          aiPromptContext: dto.contentSource === 'AI' ? (dto.aiPromptContext ?? null) : null,
          followUpDelayBusinessDays,
          maxFollowUps,
        },
      });

      if (senderAccountIds.length > 0) {
        await tx.campaignSenderAccount.createMany({
          data: senderAccountIds.map((saId) => ({
            campaignId: campaign.id,
            senderAccountId: saId,
          })),
        });
      }

      return {
        id: campaign.id,
        workspaceId: campaign.workspaceId,
        name: campaign.name,
        status: campaign.status,
        contentSource: campaign.contentSource,
        templateId: campaign.templateId,
        aiPromptContext: campaign.aiPromptContext,
        followUpDelayBusinessDays: campaign.followUpDelayBusinessDays,
        maxFollowUps: campaign.maxFollowUps,
        senderAccountIds,
        createdAt: campaign.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: campaign.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }
}
