import * as crypto from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CampaignStatus,
  Prisma,
  EmailSendStatus,
  EmailSendType,
} from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import {
  type ISuppressionChecker,
  SUPPRESSION_CHECKER_TOKEN,
} from './suppression-checker.interface';
import { EmailProviderRegistry } from '../infrastructure/email-provider.registry';

export interface ReserveSendInput {
  workspaceId: string;
  outreachId: string;
  sequence: number;
  type: EmailSendType;
  expectedStateVersion: number | null;
  subject: string;
  body: string;
  preferredSenderAccountId?: string | null;
  campaignId?: string | null;
}

@Injectable()
export class SendEligibilityService {
  constructor(
    @Inject(SUPPRESSION_CHECKER_TOKEN)
    private readonly suppressionChecker: ISuppressionChecker,
    private readonly providerRegistry: EmailProviderRegistry,
  ) {}

  public async checkOutreachEligibility(
    workspaceId: string,
    outreach: any,
    recipientEmail?: string | null,
  ): Promise<void> {
    if (!outreach || outreach.workspaceId !== workspaceId) {
      throw new AppNotFoundException('Outreach not found');
    }

    if (outreach.status !== 'APPROVED') {
      throw new AppConflictException(
        `Cannot dispatch send for outreach in ${String(outreach.status)} status. Must be APPROVED.`,
      );
    }

    if (!recipientEmail || recipientEmail.trim().length === 0) {
      throw new AppValidationException('Recipient email is missing');
    }

    const isSuppressed = await this.suppressionChecker.isSuppressed(
      workspaceId,
      recipientEmail.trim().toLowerCase(),
    );
    if (isSuppressed) {
      throw new AppConflictException(
        `Recipient email ${recipientEmail} is suppressed`,
      );
    }
  }

  public async reserveSenderCapacityAndCreateEmailSend(
    tx: Prisma.TransactionClient,
    input: ReserveSendInput,
  ) {
    if ('$connect' in tx) {
      throw new Error(
        'Capacity invariant violation: reserveSenderCapacityAndCreateEmailSend must be called within an active transaction',
      );
    }

    const {
      workspaceId,
      outreachId,
      sequence,
      type,
      expectedStateVersion,
      subject,
      body,
      preferredSenderAccountId,
      campaignId,
    } = input;

    let candidates: Array<{ id: string; daily_limit: number; provider: string }> = [];

    if (preferredSenderAccountId) {
      candidates = await tx.$queryRaw<
        Array<{ id: string; daily_limit: number; provider: string }>
      >`
        SELECT sa.id, sa.daily_limit, i.provider
        FROM sender_accounts sa
        JOIN integrations i ON sa.integration_id = i.id
        WHERE sa.id = ${preferredSenderAccountId}
          AND sa.workspace_id = ${workspaceId}
          AND sa.status = 'ACTIVE'
          AND i.status = 'ACTIVE'
        FOR UPDATE OF sa
      `;
    } else if (campaignId) {
      candidates = await tx.$queryRaw<
        Array<{ id: string; daily_limit: number; provider: string }>
      >`
        SELECT sa.id, sa.daily_limit, i.provider
        FROM sender_accounts sa
        JOIN campaign_sender_accounts csa ON csa.sender_account_id = sa.id
        JOIN integrations i ON sa.integration_id = i.id
        WHERE csa.campaign_id = ${campaignId}
          AND csa.workspace_id = ${workspaceId}
          AND csa.status = 'ACTIVE'
          AND sa.status = 'ACTIVE'
          AND i.status = 'ACTIVE'
        ORDER BY sa.id ASC
        FOR UPDATE OF sa
      `;
    } else {
      candidates = await tx.$queryRaw<
        Array<{ id: string; daily_limit: number; provider: string }>
      >`
        SELECT sa.id, sa.daily_limit, i.provider
        FROM sender_accounts sa
        JOIN integrations i ON sa.integration_id = i.id
        WHERE sa.workspace_id = ${workspaceId}
          AND sa.status = 'ACTIVE'
          AND i.status = 'ACTIVE'
        ORDER BY sa.id ASC
        FOR UPDATE OF sa
      `;
    }

    if (!candidates || candidates.length === 0) {
      throw new AppConflictException('NEEDS_SENDER');
    }

    const selectedSender = await this.checkSenderCapacity(
      tx,
      workspaceId,
      candidates,
    );

    return tx.emailSend.create({
      data: {
        workspaceId,
        outreachId,
        sequence,
        type,
        subject,
        body,
        status: EmailSendStatus.RESERVED,
        expectedStateVersion,
        reservedAt: new Date(),
        senderAccountId: selectedSender.id,
        provider: selectedSender.provider,
        replyToToken: crypto.randomBytes(20).toString('hex'),
      },
    });
  }

  public async reservePendingEmailSendForRetry(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    emailSendId: string,
    currentStateVersion: number,
  ) {
    const emailSend = await tx.emailSend.findFirst({
      where: { id: emailSendId, workspaceId },
    });

    if (!emailSend || emailSend.status !== EmailSendStatus.PENDING) {
      throw new AppConflictException('EmailSend is not in PENDING status');
    }

    // Lock existing sender account to verify capacity
    const candidates = await tx.$queryRaw<
      Array<{ id: string; daily_limit: number; provider: string }>
    >`
      SELECT sa.id, sa.daily_limit, i.provider
      FROM sender_accounts sa
      JOIN integrations i ON sa.integration_id = i.id
      WHERE sa.id = ${emailSend.senderAccountId}
        AND sa.workspace_id = ${workspaceId}
        AND sa.status = 'ACTIVE'
        AND i.status = 'ACTIVE'
      FOR UPDATE OF sa
    `;

    if (!candidates || candidates.length === 0) {
      throw new AppConflictException('SENDER_UNAVAILABLE');
    }

    await this.checkSenderCapacity(tx, workspaceId, candidates);

    return tx.emailSend.update({
      where: { id: emailSendId },
      data: {
        status: EmailSendStatus.RESERVED,
        reservedAt: new Date(),
        expectedStateVersion: currentStateVersion,
      },
    });
  }

  private async checkSenderCapacity(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    candidates: Array<{ id: string; daily_limit: number; provider: string }>,
  ): Promise<{ id: string; provider: string }> {
    const validCandidates = candidates.filter((c) =>
      this.providerRegistry.hasAdapter(c.provider),
    );

    if (validCandidates.length === 0) {
      throw new AppConflictException('PROVIDER_UNSUPPORTED');
    }

    const nowUtc = new Date();
    const startOfDayUtc = new Date(
      Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate(),
      ),
    );

    const candidateScores = [];

    for (const candidate of validCandidates) {
      const consumedCountResult = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM email_sends
        WHERE workspace_id = ${workspaceId}
          AND sender_account_id = ${candidate.id}
          AND status IN ('RESERVED', 'SENDING', 'SENT')
          AND created_at >= ${startOfDayUtc}
      `;

      const consumedCount = Number(consumedCountResult[0]?.count || 0);

      if (consumedCount < candidate.daily_limit) {
        candidateScores.push({ ...candidate, consumedCount });
      }
    }

    if (candidateScores.length === 0) {
      throw new AppConflictException('SENDER_CAPACITY_EXCEEDED');
    }

    candidateScores.sort((a, b) => {
      if (a.consumedCount !== b.consumedCount) {
        return a.consumedCount - b.consumedCount;
      }
      return a.id.localeCompare(b.id);
    });

    return {
      id: candidateScores[0].id,
      provider: candidateScores[0].provider,
    };
  }
}
