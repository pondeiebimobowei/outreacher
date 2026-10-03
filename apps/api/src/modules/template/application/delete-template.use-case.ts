import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';

@Injectable()
export class DeleteTemplateUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(workspaceId: string, templateId: string): Promise<void> {
    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        workspaceId,
      },
    });

    if (!template) {
      throw new AppNotFoundException(`Email template ${templateId} not found`);
    }

    // Check if referenced by any Campaign or Outreach
    const [referencingCampaign, referencingOutreach] = await Promise.all([
      this.prisma.campaign.findFirst({
        where: { workspaceId, templateId },
        select: { id: true },
      }),
      this.prisma.outreach.findFirst({
        where: { workspaceId, templateId },
        select: { id: true },
      }),
    ]);

    if (referencingCampaign || referencingOutreach) {
      throw new AppConflictException(
        'A template cannot be hard-deleted while referenced by any Campaign or Outreach. Archive it instead.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx: any) => {
        await tx.emailTemplateStep.deleteMany({
          where: { templateId },
        });
        await tx.emailTemplate.delete({
          where: { id: templateId },
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new AppConflictException(
          'A template cannot be hard-deleted while referenced by any Campaign or Outreach. Archive it instead.',
        );
      }
      throw err;
    }
  }
}
