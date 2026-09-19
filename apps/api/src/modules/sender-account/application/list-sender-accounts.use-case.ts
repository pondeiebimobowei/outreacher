import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ListSenderAccountsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string) {
    return this.prisma.senderAccount.findMany({
      where: { workspaceId },
      include: {
        integration: {
          select: {
            id: true,
            provider: true,
            status: true,
            name: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
