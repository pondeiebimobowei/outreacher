import { Injectable } from '@nestjs/common';
import { EmailTemplateSummaryDto } from '@repo/shared';
import { PrismaClient } from '@repo/db';

@Injectable()
export class ListTemplatesUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(
    workspaceId: string,
    includeArchived = false,
  ): Promise<EmailTemplateSummaryDto[]> {
    const templates = await this.prisma.emailTemplate.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      include: {
        _count: {
          select: { steps: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates.map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      name: t.name,
      isArchived: t.isArchived,
      stepCount: t._count.steps,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }
}
