import { Inject, Injectable } from '@nestjs/common';
import { CampaignStatus, CampaignContactStatus } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import {
  type ISuppressionChecker,
  SUPPRESSION_CHECKER_TOKEN,
} from './suppression-checker.interface';

export interface SendEligibilityCheckInput {
  workspaceId: string;
  campaign: {
    id: string;
    workspaceId: string;
    status: CampaignStatus;
  };
  campaignContact: {
    id: string;
    workspaceId: string;
    status: CampaignContactStatus;
    currentSubject: string | null;
    currentBody: string | null;
    contact: {
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
  ) {}

  public async checkEligibility(
    input: SendEligibilityCheckInput,
  ): Promise<SendEligibilityResult> {
    const { workspaceId, campaign, campaignContact } = input;

    // 1. Workspace isolation enforcement
    if (
      campaign.workspaceId !== workspaceId ||
      campaignContact.workspaceId !== workspaceId
    ) {
      throw new AppNotFoundException('Campaign or campaign contact not found');
    }

    // 2. Campaign lifecycle status checks
    if (campaign.status === CampaignStatus.SCHEDULED) {
      throw new AppConflictException(
        'Cannot dispatch immediate send: Campaign is SCHEDULED for automated start',
      );
    }

    if (campaign.status === CampaignStatus.PAUSED) {
      throw new AppConflictException(
        'Cannot dispatch send: Campaign is PAUSED',
      );
    }

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new AppConflictException(
        'Cannot dispatch send: Campaign is ARCHIVED',
      );
    }

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new AppConflictException(
        'Cannot dispatch send: Campaign is COMPLETED',
      );
    }

    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.ACTIVE
    ) {
      throw new AppConflictException(
        `Cannot dispatch send for campaign in ${String(campaign.status)} status`,
      );
    }

    // 3. CampaignContact status check
    if (campaignContact.status !== CampaignContactStatus.READY) {
      throw new AppConflictException(
        `Cannot dispatch send for contact in ${campaignContact.status} status`,
      );
    }

    // 4. Contact recipient email check & canonical normalization
    const rawEmail = campaignContact.contact?.email;
    if (!rawEmail || !rawEmail.trim()) {
      throw new AppValidationException(
        'Cannot dispatch send: contact has no recipient email',
      );
    }
    const canonicalEmail = rawEmail.trim().toLowerCase();

    // 5. Suppression check via domain interface
    const isSuppressed = await this.suppressionChecker.isSuppressed(
      workspaceId,
      canonicalEmail,
    );
    if (isSuppressed) {
      throw new AppConflictException('Recipient email is suppressed');
    }

    // 6. Draft content validity checks
    const subject = campaignContact.currentSubject;
    if (!subject || subject.length < 3 || subject.length > 150) {
      throw new AppValidationException(
        'Cannot dispatch send: subject must be between 3 and 150 characters',
      );
    }

    const body = campaignContact.currentBody;
    if (!body || body.length < 20 || body.length > 4000) {
      throw new AppValidationException(
        'Cannot dispatch send: body must be between 20 and 4000 characters',
      );
    }

    return {
      canonicalEmail,
      subject,
      body,
    };
  }
}
