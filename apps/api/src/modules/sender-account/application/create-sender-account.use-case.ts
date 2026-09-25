import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateSenderAccountDto } from '../dto/create-sender-account.dto';
import {
  AppValidationException,
  AppNotFoundException,
  AppConflictException,
} from '../../../common/errors/application.exception';
import { SenderStatus } from '@repo/db';

@Injectable()
export class CreateSenderAccountUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, dto: CreateSenderAccountDto) {
    const integration = await this.prisma.integration.findUnique({
      where: { workspaceId_id: { workspaceId, id: dto.integrationId } },
    });

    if (!integration) {
      throw new AppValidationException(
        'Integration does not exist or does not belong to this workspace',
      );
    }

    const canonicalFromEmail = dto.fromEmail.trim().toLowerCase();
    const canonicalReplyTo = dto.replyTo
      ? dto.replyTo.trim().toLowerCase()
      : null;

    const existingSender = await this.prisma.senderAccount.findFirst({
      where: {
        workspaceId,
        fromEmail: canonicalFromEmail,
      },
    });

    if (existingSender) {
      throw new AppConflictException(
        'A sender account with this canonical fromEmail already exists in the workspace',
      );
    }

    return this.prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: dto.integrationId,
        fromName: dto.fromName,
        fromEmail: canonicalFromEmail,
        replyTo: canonicalReplyTo,
        dailyLimit: dto.dailyLimit || 50,
        sendingWindow: dto.sendingWindow,
        status: SenderStatus.ACTIVE,
      },
    });
  }
}
