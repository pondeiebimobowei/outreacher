import * as crypto from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignMemberStatus, Prisma, EmailSendStatus } from '@repo/db';
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

export interface SendEligibilityCheckInput {
  workspaceId: string;
  campaign: {
    id: string;
    workspaceId: string;
    status: CampaignStatus;
  };
  campaignMember: {
    id: string;
    workspaceId: string;
    status: CampaignMemberStatus;
    currentSubject: string | null;
    currentBody: string | null;
    person: {
      id: string;
      email: string | null;
    } | null;
  };
}

export interface SendEligibilityResult {
  canonicalEmail: string;
  subject: string;
  body: string;
}

@Injectable()
export class SendEligibilityService {
  constructor(
    @Inject(SUPPRESSION_CHECKER_TOKEN)
    private readonly suppressionChecker: ISuppressionChecker,
    private readonly providerRegistry: EmailProviderRegistry,
  ) {}

  public async checkCampaignMemberEligibility(
    input: SendEligibilityCheckInput,
  ): Promise<SendEligibilityResult> {
    const { workspaceId, campaign, campaignMember } = input;

    if (campaign.workspaceId !== workspaceId || campaignMember.workspaceId !== workspaceId) {
      throw new AppNotFoundException('Campaign or campaign contact not found');
    }

    if (campaign.status === CampaignStatus.SCHEDULED) {
      throw new AppConflictException('Cannot dispatch immediate send: Campaign is SCHEDULED for automated start');
    }

    if (campaign.status === CampaignStatus.PAUSED) {
      throw new AppConflictException('Cannot dispatch send: Campaign is PAUSED');
    }

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new AppConflictException('Cannot dispatch send: Campaign is ARCHIVED');
    }

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new AppConflictException('Cannot dispatch send: Campaign is COMPLETED');
    }

    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.ACTIVE) {
      throw new AppConflictException(`Cannot dispatch send for campaign in ${String(campaign.status)} status`);
    }

    if (campaignMember.status !== CampaignMemberStatus.READY) {
      throw new AppConflictException(`Cannot dispatch send for contact in ${campaignMember.status} status`);
    }

    return this.validateEmailContentAndSuppression(workspaceId, campaignMember.person?.email, campaignMember.currentSubject, campaignMember.currentBody);
  }

  public async checkOutreachEligibility(
    workspaceId: string,
    outreach: { status: import('@repo/db').OutreachStatus; subject: string; message: string },
    personEmail: string | null | undefined
  ): Promise<SendEligibilityResult> {
    if (outreach.status !== 'DRAFT') {
      throw new AppConflictException(`Cannot dispatch send for outreach in ${outreach.status} status`);
    }

    return this.validateEmailContentAndSuppression(workspaceId, personEmail, outreach.subject, outreach.message);
  }

  private async validateEmailContentAndSuppression(
    workspaceId: string,
    rawEmail: string | null | undefined,
    subject: string | null | undefined,
    body: string | null | undefined,
  ): Promise<SendEligibilityResult> {
    if (!rawEmail || !rawEmail.trim()) {
      throw new AppValidationException('Cannot dispatch send: contact has no recipient email');
    }
    const canonicalEmail = rawEmail.trim().toLowerCase();

    const isSuppressed = await this.suppressionChecker.isSuppressed(workspaceId, canonicalEmail);
    if (isSuppressed) {
      throw new AppConflictException('Recipient email is suppressed');
    }

    if (!subject || subject.length < 3 || subject.length > 150) {
      throw new AppValidationException('Cannot dispatch send: subject must be between 3 and 150 characters');
    }

    if (!body || body.length < 20 || body.length > 4000) {
      throw new AppValidationException('Cannot dispatch send: body must be between 20 and 4000 characters');
    }

    return { canonicalEmail, subject, body };
  }
  
  public async reserveSenderCapacityAndCreateEmailSend(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    campaignId: string,
    emailSendData: {
      campaignMemberId: string;
      type: import('@repo/db').EmailSendType;
      subject: string;
      body: string;
    }
  ) { 
    if ('$connect' in tx) {
      throw new Error('Capacity invariant violation: reserveSenderCapacityAndCreateEmailSend must be called within an active transaction');
    }
    const selectedSender = await this.selectEligibleSenderAccountForCampaign(tx, workspaceId, campaignId);
    
    return tx.emailSend.create({
      data: {
        workspaceId,
        campaignId,
        campaignMemberId: emailSendData.campaignMemberId,
        type: emailSendData.type,
        subject: emailSendData.subject,
        body: emailSendData.body,
        status: EmailSendStatus.RESERVED,
        reservedAt: new Date(),
        senderAccountId: selectedSender.id,
        provider: selectedSender.provider,
        replyToToken: crypto.randomBytes(20).toString("hex"),
      },
    });
  }

  public async reserveSenderCapacityAndCreateEmailSendForOutreach(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    outreachId: string,
    senderAccountId: string,
    emailSendData: {
      subject: string;
      body: string;
    }
  ) {
    if ('$connect' in tx) {
      throw new Error('Capacity invariant violation: reserveSenderCapacityAndCreateEmailSendForOutreach must be called within an active transaction');
    }
    
    // Validate the specific sender account
    const candidates = await tx.$queryRaw<Array<{ id: string, daily_limit: number, provider: string }>>`
      SELECT sa.id, sa.daily_limit, i.provider
      FROM sender_accounts sa
      JOIN integrations i ON sa.integration_id = i.id
      WHERE sa.id = ${senderAccountId}
        AND sa.workspace_id = ${workspaceId}
        AND sa.status = 'ACTIVE'
        AND i.status = 'ACTIVE'
      FOR UPDATE OF sa
    `;
    
    if (!candidates || candidates.length === 0) {
      throw new AppConflictException('NEEDS_SENDER');
    }
    
    const selectedSender = await this.checkSenderCapacity(tx, workspaceId, candidates);
    
    return tx.emailSend.create({
      data: {
        workspaceId,
        outreachId,
        type: 'INITIAL',
        subject: emailSendData.subject,
        body: emailSendData.body,
        status: EmailSendStatus.RESERVED,
        reservedAt: new Date(),
        senderAccountId: selectedSender.id,
        provider: selectedSender.provider,
        replyToToken: crypto.randomBytes(20).toString("hex"),
      },
    });
  }

  private async selectEligibleSenderAccountForCampaign(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    campaignId: string
  ): Promise<{ id: string; provider: string }> {
    // Lock candidate sender accounts assigned to this campaign
    const candidates = await tx.$queryRaw<Array<{ id: string, daily_limit: number, provider: string }>>`
      SELECT sa.id, sa.daily_limit, i.provider
      FROM sender_accounts sa
      JOIN campaign_sender_accounts csa ON csa.sender_account_id = sa.id
      JOIN integrations i ON sa.integration_id = i.id
      WHERE csa.campaign_id = ${campaignId}
        AND csa.workspace_id = ${workspaceId}
        AND csa.status = 'ACTIVE'
        AND sa.status = 'ACTIVE'
        AND i.status = 'ACTIVE'
      FOR UPDATE OF sa
    `;

    if (!candidates || candidates.length === 0) {
      throw new AppConflictException('NEEDS_SENDER');
    }

    return this.checkSenderCapacity(tx, workspaceId, candidates);
  }

  private async checkSenderCapacity(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    candidates: Array<{ id: string, daily_limit: number, provider: string }>
  ): Promise<{ id: string; provider: string }> {
    const validCandidates = candidates.filter(c => this.providerRegistry.hasAdapter(c.provider));
    
    if (validCandidates.length === 0) {
      throw new AppConflictException('PROVIDER_UNSUPPORTED');
    }

    // Determine UTC boundaries for today
    const nowUtc = new Date();
    const startOfDayUtc = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate()));

    const candidateScores = [];

    for (const candidate of validCandidates) {
      // Calculate consumed count for current UTC day
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
      return a.id.localeCompare(b.id); // Tie-break by id ASC
    });

    return {
      id: candidateScores[0].id,
      provider: candidateScores[0].provider
    };
  }
}
