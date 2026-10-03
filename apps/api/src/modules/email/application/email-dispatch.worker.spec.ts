import {
  EmailSendStatus,
  JobStatus,
} from '@repo/db';
import {
  EmailDispatchErrorCode,
  SendEmailResult,
} from '../domain/email-provider.adapter';
import { EmailProviderException } from '../infrastructure/resend-email-provider.adapter';
import { ClaimedEmailJob, EmailDispatchWorker } from './email-dispatch.worker';

describe('EmailDispatchWorker', () => {
  let worker: EmailDispatchWorker;
  let mockPrisma: any;
  let mockAdapter: any;
  let mockRegistry: any;
  let mockSecretResolver: any;

  const workspaceId = 'ws-1111-1111-1111';
  const outreachId = 'out-2222-2222-2222';
  const emailSendId = 'send-3333-3333-3333';
  const jobId = 'job-4444-4444-4444';
  const pcaId = 'pca-5555-5555-5555';
  const campaignRecipientId = 'recip-6666-6666-6666';
  const campaignId = 'camp-7777-7777-7777';

  const baseEmailSendRecord = {
    id: emailSendId,
    workspaceId,
    outreachId,
    sequence: 0,
    status: EmailSendStatus.RESERVED,
    subject: 'Initial Outreach',
    body: 'Hello, this is our initial message.',
    replyToToken: 'token123',
    provider: 'RESEND',
    expectedStateVersion: 0,
    firstProviderAttemptAt: null,
    senderAccount: {
      id: 'sa-1',
      fromName: 'Sales Team',
      fromEmail: 'sales@startup.com',
      replyTo: null,
      integration: {
        provider: 'RESEND',
        secretReference: 'env://RESEND_KEY',
      },
    },
    outreach: {
      id: outreachId,
      workspaceId,
      status: 'SENDING',
      personCompanyAssociationId: pcaId,
      campaignRecipientId,
      personCompanyAssociation: {
        id: pcaId,
        workEmail: 'founder@example.com',
        conversationState: 'NO_REPLY',
        stateVersion: 0,
        person: {
          id: 'person-1',
          email: 'founder@example.com',
        },
      },
      campaignRecipient: {
        id: campaignRecipientId,
        campaignId,
        status: 'ACTIVE',
        campaign: {
          id: campaignId,
          status: 'ACTIVE',
        },
      },
    },
  };
  let currentEmailSend: any;

  beforeEach(() => {
    currentEmailSend = JSON.parse(JSON.stringify(baseEmailSendRecord));

    mockPrisma = {
      $queryRaw: jest.fn(),
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: any) => Promise<any>) => {
          return callback(mockPrisma);
        }),
      job: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailSend: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(currentEmailSend)),
        update: jest.fn().mockImplementation(async ({ data }) => {
          const base = await mockPrisma.emailSend.findUnique();
          currentEmailSend = {
            ...base,
            ...data,
          };
          return currentEmailSend;
        }),
      },
      outreach: {
        findUnique: jest.fn().mockResolvedValue(baseEmailSendRecord.outreach),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      campaignRecipient: {
        findUnique: jest.fn().mockResolvedValue(baseEmailSendRecord.outreach.campaignRecipient),
        update: jest.fn(),
      },
      campaign: {
        findUnique: jest.fn().mockResolvedValue(baseEmailSendRecord.outreach.campaignRecipient.campaign),
      },
      personCompanyAssociation: {
        findUnique: jest.fn().mockResolvedValue(baseEmailSendRecord.outreach.personCompanyAssociation),
        update: jest.fn(),
      },
      conversationMessage: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      },
    };

    mockAdapter = {
      provider: 'RESEND',
      idempotencyWindowMs: 24 * 60 * 60 * 1000,
      sendEmail: jest.fn(),
    };
    mockRegistry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
    };
    mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue('resolved_secret_key'),
    };

    worker = new EmailDispatchWorker(
      mockPrisma,
      mockRegistry,
      mockSecretResolver,
    );
  });

  describe('claimNextJob', () => {
    it('returns null when no eligible jobs are found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await worker.claimNextJob();

      expect(result).toBeNull();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('claims job, advances to RUNNING, and increments attemptCount', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: jobId, attempt_count: 0 }]);

      const claimedJob = {
        id: jobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { emailSendId },
        leaseVersion: 0,
      };

      mockPrisma.job.update.mockResolvedValue(claimedJob);

      const result = await worker.claimNextJob();

      expect(result).toEqual({
        job: claimedJob,
        claimedAttempt: 1,
      });

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.RUNNING,
          attemptCount: 1,
          startedAt: expect.any(Date),
          leaseVersion: { increment: 1 },
        },
      });
    });
  });

  describe('Test 3: firstProviderAttemptAt stamping', () => {
    it('initial send stamps firstProviderAttemptAt on provider dispatch', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockResolvedValue({ providerMessageId: 'resend-123' });

      await worker.processJob(claimed);

      // Verify pre-dispatch updated status to SENDING and stamped firstProviderAttemptAt
      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: emailSendId },
          data: expect.objectContaining({
            status: EmailSendStatus.SENDING,
            firstProviderAttemptAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Test 4: Retry inside safe window', () => {
    it('SENDING -> PENDING succeeds when error is transient and within idempotency window', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const sendRecordWithFirstAttempt = {
        ...baseEmailSendRecord,
        firstProviderAttemptAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago (well within 24h)
      };
      mockPrisma.emailSend.findUnique.mockResolvedValue(sendRecordWithFirstAttempt);

      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException(
          'Rate limit exceeded',
          EmailDispatchErrorCode.PROVIDER_RATE_LIMIT,
        ),
      );

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      // Verify EmailSend transitioned back to PENDING for retry
      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: { status: EmailSendStatus.PENDING },
      });

      // Verify Job scheduled as PENDING with backoff
      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: expect.objectContaining({
          status: JobStatus.PENDING,
          availableAt: expect.any(Date),
          lastError: 'Rate limit exceeded',
        }),
      });
    });
  });

  describe('Test 5: Retry outside safe window or unknown state', () => {
    it('sets EmailSend.status = FAILED, errorCode = DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION, Outreach = FAILED', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      // 25 hours ago -> outside 24-hour window
      const expiredSendRecord = {
        ...baseEmailSendRecord,
        firstProviderAttemptAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      };
      mockPrisma.emailSend.findUnique.mockResolvedValue(expiredSendRecord);

      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException(
          'Rate limit exceeded',
          EmailDispatchErrorCode.PROVIDER_RATE_LIMIT,
        ),
      );

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: expect.any(Date),
          errorCode: EmailDispatchErrorCode.DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION,
          errorMessage: 'Rate limit exceeded',
          retryable: false,
        },
      });

      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('Test 6: Pre-dispatch boundary', () => {
    it('pausing campaign cancels RESERVED send and prevents provider call', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const pausedCampaignRecord = {
        ...baseEmailSendRecord,
        outreach: {
          ...baseEmailSendRecord.outreach,
          campaignRecipient: {
            ...baseEmailSendRecord.outreach.campaignRecipient,
            campaign: {
              id: campaignId,
              status: 'PAUSED', // Campaign is paused!
            },
          },
        },
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(pausedCampaignRecord);

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      // Provider was NEVER called
      expect(mockAdapter.sendEmail).not.toHaveBeenCalled();

      // EmailSend was CANCELLED
      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: { status: 'CANCELLED' },
      });

      // Outreach was PAUSED
      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'PAUSED' },
      });
    });
  });

  describe('Test 7: Post-dispatch pause boundary', () => {
    it('provider succeeds after campaign pause -> EmailSend = SENT, 0 follow-up jobs created, Outreach remains PAUSED', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockResolvedValue({ providerMessageId: 'resend-123' });

      // In post-dispatch check, campaign was paused while send was in flight!
      mockPrisma.campaign.findUnique.mockResolvedValue({
        id: campaignId,
        status: 'PAUSED',
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(true);

      // EmailSend is marked SENT (in-flight delivery accepted)
      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: expect.objectContaining({
          status: EmailSendStatus.SENT,
          providerMessageId: 'resend-123',
        }),
      });

      // Outreach is set to PAUSED because campaign became paused
      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'PAUSED' },
      });
    });
  });

  describe('Test 8: Fatal failure PCA release (no other open Outreach)', () => {
    it('fatal failure with no other open Outreach releases PCA.conversationState: ACTIVE -> NO_REPLY (stateVersion++)', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException(
          'Permanent rejection',
          EmailDispatchErrorCode.PROVIDER_REJECTED,
        ),
      );

      // Active PCA
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue({
        id: pcaId,
        conversationState: 'ACTIVE',
        stateVersion: 2,
      });

      // No other open outreach
      mockPrisma.outreach.findFirst.mockResolvedValue(null);

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      expect(mockPrisma.personCompanyAssociation.update).toHaveBeenCalledWith({
        where: { id: pcaId },
        data: {
          conversationState: 'NO_REPLY',
          stateVersion: { increment: 1 },
        },
      });
    });
  });

  describe('Test 9: Fatal failure with another open Outreach', () => {
    it('fatal failure with another open Outreach leaves PCA ACTIVE', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException(
          'Permanent rejection',
          EmailDispatchErrorCode.PROVIDER_REJECTED,
        ),
      );

      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue({
        id: pcaId,
        conversationState: 'ACTIVE',
        stateVersion: 2,
      });

      // Another open outreach exists!
      mockPrisma.outreach.findFirst.mockResolvedValue({
        id: 'other-outreach-id',
        status: 'ACTIVE',
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      // PCA update should NOT have been called
      expect(mockPrisma.personCompanyAssociation.update).not.toHaveBeenCalled();
    });
  });

  describe('Test 10: Fatal failure with PCA.conversationState === REPLIED', () => {
    it('fatal failure when PCA is REPLIED leaves PCA REPLIED', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException(
          'Permanent rejection',
          EmailDispatchErrorCode.PROVIDER_REJECTED,
        ),
      );

      // PCA is REPLIED
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue({
        id: pcaId,
        conversationState: 'REPLIED',
        stateVersion: 5,
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      // PCA update should NOT have been called
      expect(mockPrisma.personCompanyAssociation.update).not.toHaveBeenCalled();
    });
  });

  describe('Lease Loss Guard', () => {
    it('aborts finalization if job lease is lost or reclaimed', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(baseEmailSendRecord);
      mockAdapter.sendEmail.mockResolvedValue({
        providerMessageId: 'resend-msg-12345',
      });

      // Lease check returns 0 count (lost)
      mockPrisma.job.updateMany.mockResolvedValue({ count: 0 });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);
      expect(mockPrisma.outreach.update).not.toHaveBeenCalled();
    });
  });
});
