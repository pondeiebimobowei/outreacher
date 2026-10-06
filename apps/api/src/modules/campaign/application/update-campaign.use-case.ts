import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CampaignDto } from '@repo/shared';
import {
  AppForbiddenException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { UpdateCampaignDto } from '../dto/update-campaign.dto';

@Injectable()
export class UpdateCampaignUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
  ): Promise<CampaignDto> {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        workspaceId,
      },
    });

    if (!campaign) {
      throw new AppNotFoundException(`Campaign ${campaignId} not found`);
    }

    const effectiveContentSource = dto.contentSource ?? campaign.contentSource;
    const effectiveTemplateId =
      dto.templateId !== undefined ? dto.templateId : campaign.templateId;
    const effectiveAiPromptContext =
      dto.aiPromptContext !== undefined
        ? dto.aiPromptContext
        : campaign.aiPromptContext;
    const effectiveMaxFollowUps =
      dto.maxFollowUps !== undefined ? dto.maxFollowUps : campaign.maxFollowUps;
    const effectiveStatus = dto.status ?? campaign.status;

    // ContentSource Mutual Exclusion
    if (effectiveContentSource === 'TEMPLATE') {
      if (!effectiveTemplateId) {
        throw new AppValidationException('TEMPLATE campaign requires templateId');
      }
      if (effectiveAiPromptContext) {
        throw new AppValidationException(
          'TEMPLATE campaign must not specify aiPromptContext',
        );
      }

      const template = await this.prisma.emailTemplate.findFirst({
        where: { id: effectiveTemplateId, workspaceId },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      if (!template) {
        throw new AppNotFoundException(`Email template ${effectiveTemplateId} not found`);
      }

      this.templateEngine.validateTemplateForCampaign(
        template,
        effectiveMaxFollowUps,
      );
    } else if (effectiveContentSource === 'AI') {
      if (effectiveTemplateId) {
        throw new AppValidationException(
          'AI campaign must not specify templateId',
        );
      }
    }

    // Verify sender accounts if updating
    if (dto.senderAccountIds !== undefined) {
      if (dto.senderAccountIds.length > 0) {
        const senders = await this.prisma.senderAccount.findMany({
          where: {
            id: { in: dto.senderAccountIds },
            workspaceId,
          },
        });
        if (senders.length !== dto.senderAccountIds.length) {
          throw new AppForbiddenException(
            'One or more sender accounts do not exist or belong to another workspace',
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.contentSource ? { contentSource: dto.contentSource } : {}),
          ...(dto.templateId !== undefined
            ? { templateId: effectiveContentSource === 'TEMPLATE' ? dto.templateId : null }
            : {}),
          ...(dto.aiPromptContext !== undefined
            ? {
                aiPromptContext:
                  effectiveContentSource === 'AI' ? dto.aiPromptContext : null,
              }
            : {}),
          ...(dto.followUpDelayBusinessDays !== undefined
            ? { followUpDelayBusinessDays: dto.followUpDelayBusinessDays }
            : {}),
          ...(dto.maxFollowUps !== undefined
            ? { maxFollowUps: dto.maxFollowUps }
            : {}),
        },
      });

      if (dto.senderAccountIds !== undefined) {
        await tx.campaignSenderAccount.deleteMany({
          where: { campaignId },
        });
        if (dto.senderAccountIds.length > 0) {
          await tx.campaignSenderAccount.createMany({
            data: dto.senderAccountIds.map((saId) => ({
              campaignId,
              senderAccountId: saId,
            })),
          });
        }
      }

      return {
        id: updated.id,
        workspaceId: updated.workspaceId,
        name: updated.name,
        status: updated.status,
        contentSource: updated.contentSource,
        templateId: updated.templateId,
        aiPromptContext: updated.aiPromptContext,
        followUpDelayBusinessDays: updated.followUpDelayBusinessDays,
        maxFollowUps: updated.maxFollowUps,
        senderAccountIds: dto.senderAccountIds ?? [],
        createdAt: updated.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: updated.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }
}
