/* eslint-disable @typescript-eslint/unbound-method */
import {
  CampaignMemberStatus,
  EmailSendStatus,
  JobStatus,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { EmailDispatchErrorCode } from '../domain/email-provider.adapter';
import { EmailProviderException } from '../infrastructure/resend-email-provider.adapter';
import { ClaimedEmailJob, EmailDispatchWorker } from './email-dispatch.worker';

describe('EmailDispatchWorker', () => {
  let worker: EmailDispatchWorker;
  let mockPrisma: any;
  let mockAdapter: any;
  let mockRegistry: any;
  let mockSecretResolver: any;

  const workspaceId = 'ws-1111-1111-1111';
  const campaignMemberId = 'cc-2222-2222-2222';
  const emailSendId = 'send-3333-3333-3333';
  const jobId = 'job-4444-4444-4444';

  const mockEmailSendRecord = {
    id: emailSendId,
    workspaceId,
    subject: 'Follow-up on inquiry',
    body: 'Hello, this is a follow-up email.',
    replyToToken: 'token123',
    status: EmailSendStatus.SENDING,
    provider: 'RESEND',
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
    campaignMember: {
      id: campaignMemberId,
      workspaceId,
      status: CampaignMemberStatus.SENDING,
      person: {
        id: 'contact-5555',
        email: 'founder@example.com',
      },
      campaign: {
        id: 'camp-6666',
        sendingIdentity: 'sales@startup.com',
      },
    },
  };

  beforeEach(() => {
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
        findFirst: jest.fn(),
      },
      emailSend: {
        findUnique: jest.fn(),
        update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignMember: {
        update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockAdapter = { sendEmail: jest.fn() };
    mockRegistry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
    };
    mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue('resolved_secret_key'),
    };

    worker = new EmailDispatchWorker(mockPrisma, mockRegistry as any, mockSecretResolver as any);
  });

  describe('claimNextJob', () => {
    it('returns null when no eligible jobs are found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await worker.claimNextJob();

      expect(result).toBeNull();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });

    it('claims job, advances to RUNNING, increments attemptCount, and transitions EmailSend RESERVED -> SENDING', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: jobId, attempt_count: 0 }]);

      const claimedJob = {
        id: jobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
      };

      mockPrisma.job.update.mockResolvedValue(claimedJob);
      mockPrisma.emailSend.findUnique.mockResolvedValue({
        id: emailSendId,
        status: EmailSendStatus.RESERVED,
      });
      mockPrisma.emailSend.update.mockResolvedValue({
        id: emailSendId,
        status: EmailSendStatus.SENDING,
      });

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

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: { status: EmailSendStatus.SENDING },
      });
    });

    it('leaves EmailSend in SENDING status when already in SENDING (retry attempt)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: jobId, attempt_count: 1 }]);

      const claimedJob = {
        id: jobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.RUNNING,
        attemptCount: 2,
        payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
      };

      mockPrisma.job.update.mockResolvedValue(claimedJob);
      mockPrisma.emailSend.findUnique.mockResolvedValue({
        id: emailSendId,
        status: EmailSendStatus.SENDING,
      });

      const result = await worker.claimNextJob();

      expect(result).toEqual({
        job: claimedJob,
        claimedAttempt: 2,
      });

      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
    });
  });

  describe('processJob - Success Path', () => {
    const claimed: ClaimedEmailJob = {
      job: {
        id: jobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
      } as any,
      claimedAttempt: 1,
    };

    it('invokes provider, updates EmailSend to SENT with provider IDs, updates CampaignMember to SENT, and completes Job', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);

      const sendResult: SendEmailResult = {
        providerMessageId: 'resend-msg-12345',
        rfcMessageId: '<msg-12345@startup.com>',
        sentAt: new Date('2026-09-18T12:00:00Z'),
      };
      mockAdapter.sendEmail.mockResolvedValue(sendResult);

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(true);

      expect(mockAdapter.sendEmail).toHaveBeenCalledWith({
        workspaceId,
        senderAccountId: 'sa-1',
        campaignMemberId,
        emailSendId,
        toEmail: 'founder@example.com',
        fromName: 'Sales Team',
        fromEmail: 'sales@startup.com',
        replyTo: undefined,
        subject: 'Follow-up on inquiry',
        bodyText: 'Hello, this is a follow-up email.',
        replyToToken: 'token123',
        idempotencyKey: `send:${emailSendId}`,
        credentials: 'resolved_secret_key',
      });

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.SENT,
          providerMessageId: 'resend-msg-12345',
          messageId: undefined,
          sentAt: expect.any(Date),
        },
      });

      expect(mockPrisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: campaignMemberId },
        data: { status: CampaignMemberStatus.SENT },
      });

      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('processJob - Transient Retry Path', () => {
    const claimedAttempt1: ClaimedEmailJob = {
      job: {
        id: jobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.RUNNING,
        attemptCount: 1,
        payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
      } as any,
      claimedAttempt: 1,
    };

    it('on transient timeout with attempts < MAX_ATTEMPTS, fails immediately with PROVIDER_TIMEOUT_UNCERTAIN and sets job to DEAD_LETTER', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException('Email provider request timed out', EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimedAttempt1);

      expect(outcome).toBe(false);

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: expect.any(Date),
          errorCode: EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN,
          retryable: false,
          errorMessage: 'Email provider request timed out',
        },
      });

      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: {
          status: JobStatus.DEAD_LETTER,
          failedAt: expect.any(Date),
          lastError: expect.stringContaining('timed out'),
        },
      });
    });

    it('on transient rate limit with attempts < MAX_ATTEMPTS, schedules retry without failing send status', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException('Email provider rate limit exceeded', EmailDispatchErrorCode.PROVIDER_RATE_LIMIT),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimedAttempt1);

      expect(outcome).toBe(false);
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
      expect(mockPrisma.campaignMember.update).not.toHaveBeenCalled();
      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: {
          status: JobStatus.PENDING,
          availableAt: expect.any(Date),
          lastError: expect.stringContaining('rate limit'),
        },
      });
    });
  });

  describe('processJob - Terminal Failure Path', () => {
    it('on non-retryable provider error, updates EmailSend to FAILED, CampaignMember to FAILED, and Job to DEAD_LETTER', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException('Domain not verified by provider', EmailDispatchErrorCode.PROVIDER_REJECTED),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: expect.any(Date),
          errorCode: EmailDispatchErrorCode.PROVIDER_REJECTED,
          retryable: false,
          errorMessage: 'Domain not verified by provider',
        },
      });

      expect(mockPrisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: campaignMemberId },
        data: { status: CampaignMemberStatus.FAILED },
      });

      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: {
          status: JobStatus.DEAD_LETTER,
          failedAt: expect.any(Date),
          lastError: 'Domain not verified by provider',
        },
      });
    });

    it('on attempts exhausted (claimedAttempt = 3), transitions to FAILED even on transient error', async () => {
      const claimedAttempt3: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 3,
          payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 3,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockAdapter.sendEmail.mockRejectedValue(
        new EmailProviderException('Email provider rate limit exceeded', EmailDispatchErrorCode.PROVIDER_RATE_LIMIT),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 3,
      });

      const outcome = await worker.processJob(claimedAttempt3);

      expect(outcome).toBe(false);

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: expect.any(Date),
          errorCode: EmailDispatchErrorCode.DISPATCH_ATTEMPTS_EXHAUSTED,
          retryable: false,
          errorMessage: expect.stringContaining('rate limit'),
        },
      });

      expect(mockPrisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: campaignMemberId },
        data: { status: CampaignMemberStatus.FAILED },
      });

      expect(mockPrisma.job.updateMany).toHaveBeenCalledWith({
        where: { id: jobId, leaseVersion: 0, status: 'RUNNING' },
        data: {
          status: JobStatus.DEAD_LETTER,
          failedAt: expect.any(Date),
          lastError: expect.stringContaining('rate limit'),
        },
      });
    });
  });

  describe('processJob - Lease Loss Guard', () => {
    it('aborts finalization and does not update EmailSend or Person if job lease is lost or reclaimed', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId, campaignMemberId },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockAdapter.sendEmail.mockResolvedValue({
        providerMessageId: 'resend-msg-12345',
        rfcMessageId: '<msg-12345@startup.com>',
        sentAt: new Date(),
      });

      // Lease check returns null (e.g. timeout / reassigned)
      mockPrisma.job.updateMany.mockResolvedValue({ count: 0 });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
      expect(mockPrisma.campaignMember.update).not.toHaveBeenCalled();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });
  });
});
