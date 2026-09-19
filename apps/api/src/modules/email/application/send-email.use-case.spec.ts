import {
  CampaignContactStatus,
  CampaignStatus,
  EmailSendStatus,
  JobStatus,
  Prisma,
} from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { SendEligibilityService } from '../domain/send-eligibility.service';
import { SendEmailUseCase } from './send-email.use-case';

describe('SendEmailUseCase', () => {
  let useCase: SendEmailUseCase;
  let mockPrisma: any;
  let mockEligibilityService: any;

  const workspaceId = 'ws-1111-1111-1111';
  const campaignId = 'camp-2222-2222-2222';
  const campaignContactId = 'cc-3333-3333-3333';
  const otherContactId = 'cc-9999-9999-9999';
  const clientKey = 'idempotency-token-xyz';

  const mockCampaignContact = {
    id: campaignContactId,
    workspaceId,
    campaignId,
    status: CampaignContactStatus.READY,
    currentSubject: 'Outreach Subject',
    currentBody: 'Outreach message body that is long enough.',
    campaign: {
      id: campaignId,
      workspaceId,
      status: CampaignStatus.DRAFT,
      sendingIdentity: 'founder@startup.com',
    },
    contact: {
      id: 'contact-1',
      email: 'lead@target.com',
    },
  };

  beforeEach(() => {
    mockPrisma = {
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      campaignContact: {
        findUnique: jest.fn().mockResolvedValue(mockCampaignContact),
        update: jest.fn().mockResolvedValue({
          ...mockCampaignContact,
          status: CampaignContactStatus.SENDING,
        }),
      },
      campaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailSend: {
        create: jest.fn().mockResolvedValue({
          id: 'send-1',
          workspaceId,
          campaignId,
          campaignContactId,
          status: EmailSendStatus.RESERVED,
        }),
      },
      job: {
        create: jest.fn().mockResolvedValue({
          id: 'job-1',
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.PENDING,
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: any) => Promise<any>) => {
          return callback(mockPrisma);
        }),
    };

    mockEligibilityService = {
      checkEligibility: jest.fn().mockResolvedValue({
        canonicalEmail: 'lead@target.com',
        subject: 'Outreach Subject',
        body: 'Outreach message body that is long enough.',
      }),
      reserveSenderCapacityAndCreateEmailSend: jest.fn().mockResolvedValue({
        id: 'send-1',
        workspaceId,
        campaignId,
        campaignContactId,
        status: EmailSendStatus.RESERVED,
        senderAccountId: 'sender-123',
        provider: 'RESEND',
      }),
    };

    useCase = new SendEmailUseCase(
      mockPrisma as PrismaService,
      mockEligibilityService as SendEligibilityService,
    );
  });

  describe('Client Key Validation & Pre-Transaction Lookup', () => {
    it('throws AppValidationException if clientKey is missing or empty', async () => {
      await expect(
        useCase.execute({
          workspaceId,
          campaignContactId,
          clientKey: '   ',
        }),
      ).rejects.toThrow(
        new AppValidationException('Missing required Idempotency-Key header'),
      );
    });

    it('returns existing cached 202 response on pre-transaction match for same contact', async () => {
      mockPrisma.idempotencyRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        workspaceId,
        key: clientKey,
        targetId: campaignContactId,
        responseStatus: 202,
        responseBody: { jobId: 'existing-job-1', message: 'Dispatch enqueued' },
      });

      const result = await useCase.execute({
        workspaceId,
        campaignContactId,
        clientKey,
      });

      expect(result).toEqual({
        jobId: 'existing-job-1',
        message: 'Dispatch enqueued',
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 conflict on pre-transaction match for different contact', async () => {
      mockPrisma.idempotencyRecord.findUnique.mockResolvedValue({
        id: 'rec-1',
        workspaceId,
        key: clientKey,
        targetId: otherContactId,
        responseStatus: 202,
        responseBody: { jobId: 'other-job-1', message: 'Dispatch enqueued' },
      });

      await expect(
        useCase.execute({
          workspaceId,
          campaignContactId,
          clientKey,
        }),
      ).rejects.toThrow(
        new AppConflictException(
          `Idempotency-Key '${clientKey}' was already used for a different campaign contact`,
        ),
      );
    });
  });

  describe('Atomic Reservation Transaction', () => {
    it('successfully reserves send, activates DRAFT campaign, updates contact to SENDING, and enqueues job', async () => {
      const result = await useCase.execute({
        workspaceId,
        campaignContactId,
        clientKey,
      });

      expect(result).toEqual({
        jobId: 'job-1',
        message: 'Dispatch enqueued',
      });

      // Verifies DRAFT -> ACTIVE conditional activation
      expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
        where: {
          id: campaignId,
          workspaceId,
          status: CampaignStatus.DRAFT,
        },
        data: { status: CampaignStatus.ACTIVE },
      });

      // Verifies READY -> SENDING atomic transition
      expect(mockPrisma.campaignContact.update).toHaveBeenCalledWith({
        where: { id: campaignContactId },
        data: { status: CampaignContactStatus.SENDING },
      });

      // Verifies EmailSend created as RESERVED
      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        mockPrisma,
        workspaceId,
        campaignId,
        {
          campaignContactId,
          type: 'INITIAL',
          subject: 'Outreach Subject',
          body: 'Outreach message body that is long enough.',
        }
      );

      // Verifies Job created with canonical internal idempotency key
      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.PENDING,
          idempotencyKey: 'send:send-1',
        }),
      });

      // Verifies IdempotencyRecord created
      expect(mockPrisma.idempotencyRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId,
          key: clientKey,
          targetId: campaignContactId,
          jobId: 'job-1',
          responseStatus: 202,
        }),
      });
    });

    it('throws AppNotFoundException if campaignContact does not exist or workspace mismatch', async () => {
      mockPrisma.campaignContact.findUnique.mockResolvedValue(null);

      await expect(
        useCase.execute({
          workspaceId,
          campaignContactId,
          clientKey,
        }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('resolves to idempotent replay when contact is in SENDING and committed key matches same contact', async () => {
      // Simulate contact already transitioned to SENDING by concurrent request
      mockPrisma.campaignContact.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        status: CampaignContactStatus.SENDING,
      });

      // Inside transaction, idempotency record is now committed
      mockPrisma.idempotencyRecord.findUnique
        .mockResolvedValueOnce(null) // pre-tx returns null
        .mockResolvedValueOnce({
          id: 'rec-1',
          workspaceId,
          key: clientKey,
          targetId: campaignContactId,
          responseStatus: 202,
          responseBody: {
            jobId: 'concurrent-job-1',
            message: 'Dispatch enqueued',
          },
        });

      const result = await useCase.execute({
        workspaceId,
        campaignContactId,
        clientKey,
      });

      expect(result).toEqual({
        jobId: 'concurrent-job-1',
        message: 'Dispatch enqueued',
      });
      // Ensure eligibility check was bypassed because replay succeeded
      expect(mockEligibilityService.checkEligibility).not.toHaveBeenCalled();
    });
  });

  describe('Concurrency Race Handling (Prisma P2002)', () => {
    it('catches P2002 unique constraint error and returns cached response if key matches same contact', async () => {
      const p2002Error = new Error(
        'Unique constraint failed on the fields: (`workspace_id`,`key`)',
      ) as any;
      p2002Error.code = 'P2002';

      mockPrisma.$transaction.mockRejectedValueOnce(p2002Error);

      mockPrisma.idempotencyRecord.findUnique
        .mockResolvedValueOnce(null) // pre-tx returns null
        .mockResolvedValueOnce({
          id: 'rec-race-1',
          workspaceId,
          key: clientKey,
          targetId: campaignContactId,
          responseStatus: 202,
          responseBody: { jobId: 'race-job-1', message: 'Dispatch enqueued' },
        });

      const result = await useCase.execute({
        workspaceId,
        campaignContactId,
        clientKey,
      });

      expect(result).toEqual({
        jobId: 'race-job-1',
        message: 'Dispatch enqueued',
      });
    });

    it('catches P2002 unique constraint error and throws 409 conflict if key matches different contact', async () => {
      const p2002Error = new Error('Unique constraint failed') as any;
      p2002Error.code = 'P2002';

      mockPrisma.$transaction.mockRejectedValueOnce(p2002Error);

      mockPrisma.idempotencyRecord.findUnique
        .mockResolvedValueOnce(null) // pre-tx returns null
        .mockResolvedValueOnce({
          id: 'rec-race-1',
          workspaceId,
          key: clientKey,
          targetId: otherContactId,
          responseStatus: 202,
          responseBody: {
            jobId: 'race-job-other',
            message: 'Dispatch enqueued',
          },
        });

      await expect(
        useCase.execute({
          workspaceId,
          campaignContactId,
          clientKey,
        }),
      ).rejects.toThrow(
        new AppConflictException(
          `Idempotency-Key '${clientKey}' was already used for a different campaign contact`,
        ),
      );
    });
  });
});
