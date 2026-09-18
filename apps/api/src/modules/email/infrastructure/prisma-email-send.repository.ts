import { Injectable } from '@nestjs/common';
import { EmailSend, EmailSendStatus, EmailSendType, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CreateReservedEmailSendData,
  IEmailSendRepository,
  UpdateEmailSendStatusData,
} from '../domain/email-send.repository.interface';

@Injectable()
export class PrismaEmailSendRepository implements IEmailSendRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  public async createReserved(
    data: CreateReservedEmailSendData,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend> {
    const client = this.getClient(tx);
    return client.emailSend.create({
      data: {
        workspaceId: data.workspaceId,
        campaignId: data.campaignId,
        campaignContactId: data.campaignContactId,
        type: data.type ?? EmailSendType.INITIAL,
        subject: data.subject,
        body: data.body,
        status: EmailSendStatus.RESERVED,
        scheduledAt: data.scheduledAt ?? null,
        reservedAt: data.reservedAt ?? new Date(),
      },
    });
  }

  public async updateStatus(
    workspaceId: string,
    id: string,
    data: UpdateEmailSendStatusData,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend | null> {
    const client = this.getClient(tx);
    const existing = await client.emailSend.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return null;
    }

    return client.emailSend.update({
      where: { id },
      data: {
        status: data.status,
        providerMessageId:
          data.providerMessageId !== undefined
            ? data.providerMessageId
            : existing.providerMessageId,
        messageId:
          data.messageId !== undefined ? data.messageId : existing.messageId,
        provider:
          data.provider !== undefined ? data.provider : existing.provider,
        sentAt: data.sentAt !== undefined ? data.sentAt : existing.sentAt,
        failedAt:
          data.failedAt !== undefined ? data.failedAt : existing.failedAt,
        errorCode:
          data.errorCode !== undefined ? data.errorCode : existing.errorCode,
        errorMessage:
          data.errorMessage !== undefined
            ? data.errorMessage
            : existing.errorMessage,
      },
    });
  }

  public async findById(
    workspaceId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend | null> {
    const client = this.getClient(tx);
    return client.emailSend.findFirst({
      where: { id, workspaceId },
    });
  }

  public async findByCampaignContactId(
    workspaceId: string,
    campaignContactId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend[]> {
    const client = this.getClient(tx);
    return client.emailSend.findMany({
      where: { workspaceId, campaignContactId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
