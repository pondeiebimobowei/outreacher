import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ListCampaignSendersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, campaignId: string) {
    return this.prisma.campaignSenderAccount.findMany({
      where: {
        workspaceId,
        campaignId,
        status: 'ACTIVE',
      },
      include: {
        senderAccount: {
          include: {
            integration: {
              select: {
                id: true,
                provider: true,
                status: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
