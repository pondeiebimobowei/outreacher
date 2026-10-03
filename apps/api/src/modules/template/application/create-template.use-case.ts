import { Injectable } from '@nestjs/common';
import { EmailTemplateDto } from '@repo/shared';
import { PrismaClient } from '@repo/db';
import { AppConflictException, AppValidationException } from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../domain/template-engine.service';
import { CreateTemplateDto } from '../dto/create-template.dto';

@Injectable()
export class CreateTemplateUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    dto: CreateTemplateDto,
  ): Promise<EmailTemplateDto> {
    if (!dto.name || dto.name.trim() === '') {
      throw new AppValidationException('Template name is required');
    }
    if (!dto.steps || dto.steps.length === 0) {
      throw new AppValidationException('At least one step is required');
    }

    // Validate placeholders in all steps
    for (const step of dto.steps) {
      this.templateEngine.assertValidPlaceholders(step.subjectTemplate);
      this.templateEngine.assertValidPlaceholders(step.bodyTemplate);
    }

    // Check duplicate name
    const existing = await this.prisma.emailTemplate.findFirst({
      where: {
        workspaceId,
        name: dto.name.trim(),
      },
    });

    if (existing) {
      throw new AppConflictException(
        `A template named "${dto.name.trim()}" already exists in this workspace`,
      );
    }

    return this.prisma.$transaction(async (tx: any) => {
      const template = await tx.emailTemplate.create({
        data: {
          workspaceId,
          name: dto.name.trim(),
          isArchived: false,
        },
      });

      await tx.emailTemplateStep.createMany({
        data: dto.steps.map((s) => ({
          templateId: template.id,
          sequence: s.sequence,
          subjectTemplate: s.subjectTemplate,
          bodyTemplate: s.bodyTemplate,
        })),
      });

      const steps = await tx.emailTemplateStep.findMany({
        where: { templateId: template.id },
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
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      };
    });
  }
}
