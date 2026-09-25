/* eslint-disable @typescript-eslint/unbound-method */
import { CampaignStatus, CampaignMemberStatus } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { ISuppressionChecker } from './suppression-checker.interface';
import {
  SendEligibilityCheckInput,
  SendEligibilityService,
} from './send-eligibility.service';

describe('SendEligibilityService', () => {
  let service: SendEligibilityService;
  let mockSuppressionChecker: ISuppressionChecker;

  const validWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const validCampaignId = '22222222-2222-2222-2222-222222222222';
  const validContactId = '33333333-3333-3333-3333-333333333333';

  const createValidInput = (): SendEligibilityCheckInput => ({
    workspaceId: validWorkspaceId,
    campaign: {
      id: validCampaignId,
      workspaceId: validWorkspaceId,
      status: CampaignStatus.DRAFT,
    },
    campaignMember: {
      id: validContactId,
      workspaceId: validWorkspaceId,
      status: CampaignMemberStatus.READY,
      currentSubject: 'Valid Outreach Subject',
      currentBody:
        'Hello! This is a valid outreach body message that is long enough.',
      person: {
        id: 'contact-uuid-1',
        email: '  Recipient@Domain.COM  ',
      },
    },
  });

  beforeEach(() => {
    mockSuppressionChecker = {
      isSuppressed: jest.fn().mockResolvedValue(false),
    };
    service = new SendEligibilityService(mockSuppressionChecker);
  });

  describe('Campaign Status Matrix', () => {
    it('allows DRAFT campaign and returns canonical email and draft content', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.DRAFT;

      const result = await service.checkCampaignMemberEligibility(input);

      expect(result.canonicalEmail).toBe('recipient@domain.com');
      expect(result.subject).toBe('Valid Outreach Subject');
      expect(result.body).toBe(
        'Hello! This is a valid outreach body message that is long enough.',
      );
      expect(mockSuppressionChecker.isSuppressed).toHaveBeenCalledWith(
        validWorkspaceId,
        'recipient@domain.com',
      );
    });

    it('allows ACTIVE campaign', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.ACTIVE;

      const result = await service.checkCampaignMemberEligibility(input);

      expect(result.canonicalEmail).toBe('recipient@domain.com');
    });

    it('rejects SCHEDULED campaign with 409 conflict', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.SCHEDULED;

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppConflictException(
          'Cannot dispatch immediate send: Campaign is SCHEDULED for automated start',
        ),
      );
    });

    it('rejects PAUSED campaign with 409 conflict', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.PAUSED;

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppConflictException('Cannot dispatch send: Campaign is PAUSED'),
      );
    });

    it('rejects ARCHIVED campaign with 409 conflict', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.ARCHIVED;

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppConflictException('Cannot dispatch send: Campaign is ARCHIVED'),
      );
    });

    it('rejects COMPLETED campaign with 409 conflict', async () => {
      const input = createValidInput();
      input.campaign.status = CampaignStatus.COMPLETED;

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppConflictException('Cannot dispatch send: Campaign is COMPLETED'),
      );
    });
  });

  describe('Workspace Isolation', () => {
    it('rejects when campaign workspaceId does not match authenticated workspace', async () => {
      const input = createValidInput();
      input.campaign.workspaceId = 'different-workspace-uuid';

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('rejects when campaignMember workspaceId does not match authenticated workspace', async () => {
      const input = createValidInput();
      input.campaignMember.workspaceId = 'different-workspace-uuid';

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(AppNotFoundException);
    });
  });

  describe('CampaignMember Status Guards', () => {
    const nonReadyStatuses = [
      CampaignMemberStatus.PENDING,
      CampaignMemberStatus.SCHEDULED,
      CampaignMemberStatus.SENDING,
      CampaignMemberStatus.SENT,
      CampaignMemberStatus.FOLLOW_UP_DUE,
      CampaignMemberStatus.REPLIED,
      CampaignMemberStatus.COMPLETED,
      CampaignMemberStatus.SUPPRESSED,
      CampaignMemberStatus.FAILED,
      CampaignMemberStatus.ARCHIVED,
    ];

    it.each(nonReadyStatuses)(
      'rejects when campaignMember status is %s',
      async (status) => {
        const input = createValidInput();
        input.campaignMember.status = status;

        await expect(
          service.checkCampaignMemberEligibility(input),
        ).rejects.toThrow(
          new AppConflictException(
            `Cannot dispatch send for contact in ${status} status`,
          ),
        );
      },
    );
  });

  describe('Recipient Email and Canonical Normalization', () => {
    it('rejects when contact has no email', async () => {
      const input = createValidInput();
      input.campaignMember.person = { id: 'contact-uuid', email: null };

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: contact has no recipient email',
        ),
      );
    });

    it('rejects when contact email is empty or whitespace', async () => {
      const input = createValidInput();
      input.campaignMember.person = { id: 'contact-uuid', email: '   ' };

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: contact has no recipient email',
        ),
      );
    });

    it('canonicalizes email with trim().toLowerCase()', async () => {
      const input = createValidInput();
      input.campaignMember.person = {
        id: 'contact-uuid',
        email: '  John.Doe@AcmeCorp.COM \t',
      };

      const result = await service.checkCampaignMemberEligibility(input);

      expect(result.canonicalEmail).toBe('john.doe@acmecorp.com');
      expect(mockSuppressionChecker.isSuppressed).toHaveBeenCalledWith(
        validWorkspaceId,
        'john.doe@acmecorp.com',
      );
    });
  });

  describe('Suppression Enforcement', () => {
    it('rejects when recipient email is suppressed', async () => {
      (mockSuppressionChecker.isSuppressed as jest.Mock).mockResolvedValue(
        true,
      );
      const input = createValidInput();

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppConflictException('Recipient email is suppressed'),
      );
    });
  });

  describe('Draft Content Validation', () => {
    it('rejects when subject is missing or less than 3 chars', async () => {
      const input = createValidInput();
      input.campaignMember.currentSubject = 'Hi';

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: subject must be between 3 and 150 characters',
        ),
      );
    });

    it('rejects when subject exceeds 150 chars', async () => {
      const input = createValidInput();
      input.campaignMember.currentSubject = 'A'.repeat(151);

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: subject must be between 3 and 150 characters',
        ),
      );
    });

    it('rejects when body is missing or less than 20 chars', async () => {
      const input = createValidInput();
      input.campaignMember.currentBody = 'Short body';

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: body must be between 20 and 4000 characters',
        ),
      );
    });

    it('rejects when body exceeds 4000 chars', async () => {
      const input = createValidInput();
      input.campaignMember.currentBody = 'B'.repeat(4001);

      await expect(
        service.checkCampaignMemberEligibility(input),
      ).rejects.toThrow(
        new AppValidationException(
          'Cannot dispatch send: body must be between 20 and 4000 characters',
        ),
      );
    });
  });
});
