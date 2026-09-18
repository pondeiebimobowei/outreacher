import { EmailSend, EmailSendStatus, EmailSendType, Prisma } from '@repo/db';

export const EMAIL_SEND_REPOSITORY_TOKEN = 'IEmailSendRepository';

export interface CreateReservedEmailSendData {
  workspaceId: string;
  campaignId: string;
  campaignContactId: string;
  type?: EmailSendType;
  subject: string;
  body: string;
  scheduledAt?: Date | null;
  reservedAt?: Date | null;
}

export interface UpdateEmailSendStatusData {
  status: EmailSendStatus;
  providerMessageId?: string | null;
  messageId?: string | null;
  provider?: string | null;
  sentAt?: Date | null;
  failedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface IEmailSendRepository {
  createReserved(
    data: CreateReservedEmailSendData,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend>;

  updateStatus(
    workspaceId: string,
    id: string,
    data: UpdateEmailSendStatusData,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend | null>;

  findById(
    workspaceId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend | null>;

  findByCampaignContactId(
    workspaceId: string,
    campaignContactId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EmailSend[]>;
}
