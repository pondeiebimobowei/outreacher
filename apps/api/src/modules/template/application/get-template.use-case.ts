import { Injectable } from '@nestjs/common';
import { EmailTemplateDto } from '@repo/shared';
import { PrismaService } from '../../../database/prisma.service';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetTemplateUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(workspaceId: string, templateId: string): Promise<EmailTemplateDto> {
    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        workspaceId,
      },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!template) {
      throw new AppNotFoundException(`Email template ${templateId} not found`);
    }

    return {
      id: template.id,
      workspaceId: template.workspaceId,
      name: template.name,
      isArchived: template.isArchived,
      steps: template.steps.map((s) => ({
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
  }
}
