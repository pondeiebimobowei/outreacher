import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpdateSenderAccountDto } from '../dto/update-sender-account.dto';
import { AppNotFoundException, AppConflictException } from '../../../common/errors/application.exception';

@Injectable()
export class UpdateSenderAccountUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, senderAccountId: string, dto: UpdateSenderAccountDto) {
    const sender = await this.prisma.senderAccount.findUnique({
      where: { id: senderAccountId },
    });

    if (!sender || sender.workspaceId !== workspaceId) {
      throw new AppNotFoundException('Sender account not found');
    }

    let canonicalFromEmail = undefined;
    if (dto.fromEmail) {
      canonicalFromEmail = dto.fromEmail.trim().toLowerCase();
      
      if (canonicalFromEmail !== sender.fromEmail) {
        const existingSender = await this.prisma.senderAccount.findFirst({
          where: {
            workspaceId,
            fromEmail: canonicalFromEmail,
            id: { not: senderAccountId },
          },
        });

        if (existingSender) {
          throw new AppConflictException('A sender account with this canonical fromEmail already exists in the workspace');
        }
      }
    }

    let canonicalReplyTo = undefined;
    if (dto.replyTo) {
      canonicalReplyTo = dto.replyTo.trim().toLowerCase();
    }

    return this.prisma.senderAccount.update({
      where: { id: senderAccountId },
      data: {
        fromName: dto.fromName,
        fromEmail: canonicalFromEmail,
        replyTo: canonicalReplyTo !== undefined ? canonicalReplyTo : undefined,
        dailyLimit: dto.dailyLimit,
        sendingWindow: dto.sendingWindow,
        status: dto.status,
      },
    });
  }
}
