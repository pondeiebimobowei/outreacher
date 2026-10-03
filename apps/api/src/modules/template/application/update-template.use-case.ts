import { Injectable } from '@nestjs/common';
import { EmailTemplateDto } from '@repo/shared';
import { PrismaClient } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { UpdateTemplateDto } from '../dto/update-template.dto';

@Injectable()
export class UpdateTemplateUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(
    workspaceId: string,
    templateId: string,
    dto: UpdateTemplateDto,
  ): Promise<EmailTemplateDto> {
    const existing = await this.prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        workspaceId,
      },
    });

    if (!existing) {
      throw new AppNotFoundException(`Email template ${templateId} not found`);
    }

    if (dto.name && dto.name.trim() !== '' && dto.name.trim() !== existing.name) {
      const duplicate = await this.prisma.emailTemplate.findFirst({
        where: {
          workspaceId,
          name: dto.name.trim(),
          id: { not: templateId },
        },
      });

      if (duplicate) {
        throw new AppConflictException(
          `A template named "${dto.name.trim()}" already exists in this workspace`,
        );
      }
    }

    const updated = await this.prisma.emailTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      name: updated.name,
      isArchived: updated.isArchived,
      steps: updated.steps.map((s) => ({
        id: s.id,
        templateId: s.templateId,
        sequence: s.sequence,
        subjectTemplate: s.subjectTemplate,
        bodyTemplate: s.bodyTemplate,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
