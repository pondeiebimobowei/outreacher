import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ListIntegrationsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string) {
    return this.prisma.integration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
