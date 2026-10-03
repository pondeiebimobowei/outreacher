import { Injectable } from '@nestjs/common';
import { EmailTemplateDto } from '@repo/shared';
import { PrismaClient } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../domain/template-engine.service';
import { SetTemplateStepsDto } from '../dto/set-template-steps.dto';

@Injectable()
export class SetTemplateStepsUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    templateId: string,
    dto: SetTemplateStepsDto,
  ): Promise<EmailTemplateDto> {
    if (!dto.steps || dto.steps.length === 0) {
      throw new AppValidationException('At least one step is required');
    }

    // 1. Validate placeholders and contiguous sequence order
    this.templateEngine.validateContiguousSequences(dto.steps);
    for (const step of dto.steps) {
      this.templateEngine.assertValidPlaceholders(step.subjectTemplate);
      this.templateEngine.assertValidPlaceholders(step.bodyTemplate);
    }

    const newSeqSet = new Set(dto.steps.map((s) => s.sequence));

    return this.prisma.$transaction(async (tx: any) => {
      // Lock template row
      const template = await tx.emailTemplate.findFirst({
        where: {
          id: templateId,
          workspaceId,
        },
      });

      if (!template) {
        throw new AppNotFoundException(`Email template ${templateId} not found`);
      }

      // Check active campaigns referencing this template
      const activeCampaigns = await tx.campaign.findMany({
        where: {
          workspaceId,
          templateId,
          status: { in: ['ACTIVE', 'SCHEDULED'] },
        },
        select: {
          id: true,
          name: true,
          maxFollowUps: true,
        },
        orderBy: { id: 'asc' },
      });

      for (const campaign of activeCampaigns) {
        for (let seq = 0; seq <= campaign.maxFollowUps; seq++) {
          if (!newSeqSet.has(seq)) {
            throw new AppConflictException(
              `Cannot remove step ${seq}: Active Campaign "${campaign.name}" requires steps 0..${campaign.maxFollowUps}`,
            );
          }
        }
      }

      // Check active outreaches referencing this template
      const activeOutreaches = await tx.outreach.findMany({
        where: {
          workspaceId,
          templateId,
          status: { in: ['DRAFT', 'APPROVED', 'SENDING', 'ACTIVE'] },
        },
        select: {
          id: true,
          maxFollowUps: true,
        },
        orderBy: { id: 'asc' },
      });

      for (const outreach of activeOutreaches) {
        for (let seq = 0; seq <= outreach.maxFollowUps; seq++) {
          if (!newSeqSet.has(seq)) {
            throw new AppConflictException(
              `Cannot remove step ${seq}: Active Outreach "${outreach.id}" requires steps 0..${outreach.maxFollowUps}`,
            );
          }
        }
      }

      // Safe to replace steps
      await tx.emailTemplateStep.deleteMany({
        where: { templateId },
      });

      await tx.emailTemplateStep.createMany({
        data: dto.steps.map((s) => ({
          templateId,
          sequence: s.sequence,
          subjectTemplate: s.subjectTemplate,
          bodyTemplate: s.bodyTemplate,
        })),
      });

      const steps = await tx.emailTemplateStep.findMany({
        where: { templateId },
        orderBy: { sequence: 'asc' },
      });

      return {
        id: template.id,
        workspaceId: template.workspaceId,
        name: template.name,
        isArchived: template.isArchived,
        steps: steps.map((s: any) => ({
          id: s.id,
          templateId: s.templateId,
          sequence: s.sequence,
          subjectTemplate: s.subjectTemplate,
          bodyTemplate: s.bodyTemplate,
          createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
          updatedAt: s.updatedAt?.toISOString?.() ?? new Date().toISOString(),
        })),
        createdAt: template.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updatedAt: template.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      };
    });
  }
}
