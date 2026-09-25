import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetSenderAccountUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, senderAccountId: string) {
    const sender = await this.prisma.senderAccount.findUnique({
      where: { id: senderAccountId },
      include: {
        integration: {
          select: {
            id: true,
            provider: true,
            status: true,
            name: true,
          },
        },
      },
    });

    if (!sender || sender.workspaceId !== workspaceId) {
      throw new AppNotFoundException('Sender account not found');
    }

    return sender;
  }
}
