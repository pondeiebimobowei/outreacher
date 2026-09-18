import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { ISuppressionChecker } from '../domain/suppression-checker.interface';

@Injectable()
export class PrismaSuppressionChecker implements ISuppressionChecker {
  constructor(private readonly prisma: PrismaService) {}

  public async isSuppressed(
    workspaceId: string,
    email: string,
  ): Promise<boolean> {
    const canonicalEmail = email.trim().toLowerCase();

    const record = await this.prisma.suppression.findUnique({
      where: {
        workspaceId_email: {
          workspaceId,
          email: canonicalEmail,
        },
      },
    });

    return Boolean(record);
  }
}
