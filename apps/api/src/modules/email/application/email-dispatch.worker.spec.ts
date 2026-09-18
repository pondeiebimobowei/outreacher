/* eslint-disable @typescript-eslint/unbound-method */
import {
  CampaignContactStatus,
  EmailSendStatus,
  JobStatus,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  EmailProviderException,
  EmailRateLimitException,
  EmailTimeoutException,
  IEmailSender,
  SendEmailResult,
} from '../domain/email-sender.interface';
import { ClaimedEmailJob, EmailDispatchWorker } from './email-dispatch.worker';

describe('EmailDispatchWorker', () => {
  let worker: EmailDispatchWorker;
  let mockPrisma: any;
  let mockEmailSender: jest.Mocked<IEmailSender>;

  const workspaceId = 'ws-1111-1111-1111';
  const campaignContactId = 'cc-2222-2222-2222';
  const emailSendId = 'send-3333-3333-3333';
  const jobId = 'job-4444-4444-4444';

  const mockEmailSendRecord = {
    id: emailSendId,
    workspaceId,
    subject: 'Follow-up on inquiry',
    body: 'Hello, this is a follow-up email.',
    status: EmailSendStatus.SENDING,
    campaignContact: {
      id: campaignContactId,
      workspaceId,
      status: CampaignContactStatus.SENDING,
      contact: {
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
        findFirst: jest.fn(),
      },
      emailSend: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      campaignContact: {
        update: jest.fn(),
      },
    };

    mockEmailSender = {
      sendEmail: jest.fn(),
    };

    worker = new EmailDispatchWorker(mockPrisma, mockEmailSender);
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
        payload: { emailSendId, campaignContactId },
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
        payload: { emailSendId, campaignContactId },
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
        payload: { emailSendId, campaignContactId },
      } as any,
      claimedAttempt: 1,
    };

    it('invokes provider, updates EmailSend to SENT with provider IDs, updates CampaignContact to SENT, and completes Job', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);

      const sendResult: SendEmailResult = {
        providerMessageId: 'resend-msg-12345',
        rfcMessageId: '<msg-12345@startup.com>',
        sentAt: new Date('2026-09-18T12:00:00Z'),
      };
      mockEmailSender.sendEmail.mockResolvedValue(sendResult);

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(true);

      expect(mockEmailSender.sendEmail).toHaveBeenCalledWith({
        workspaceId,
        campaignContactId,
        toEmail: 'founder@example.com',
        fromEmail: 'sales@startup.com',
        subject: 'Follow-up on inquiry',
        bodyText: 'Hello, this is a follow-up email.',
        replyToToken: campaignContactId,
        idempotencyKey: `send:${campaignContactId}:1`,
      });

      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.SENT,
          providerMessageId: 'resend-msg-12345',
          messageId: '<msg-12345@startup.com>',
          sentAt: sendResult.sentAt,
        },
      });

      expect(mockPrisma.campaignContact.update).toHaveBeenCalledWith({
        where: { id: campaignContactId },
        data: { status: CampaignContactStatus.SENT },
      });

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
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
        payload: { emailSendId, campaignContactId },
      } as any,
      claimedAttempt: 1,
    };

    it('on transient timeout with attempts < MAX_ATTEMPTS, keeps EmailSend and Contact as SENDING and returns Job to PENDING with backoff', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockEmailSender.sendEmail.mockRejectedValue(
        new EmailTimeoutException('Email provider request timed out'),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimedAttempt1);

      expect(outcome).toBe(false);

      // Verify EmailSend and CampaignContact are NOT updated to FAILED
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
      expect(mockPrisma.campaignContact.update).not.toHaveBeenCalled();

      // Job is reset to PENDING with backoff
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          availableAt: expect.any(Date),
          lastError: expect.stringContaining('timed out'),
        },
      });
    });

    it('on transient rate limit with attempts < MAX_ATTEMPTS, schedules retry without failing send status', async () => {
      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockEmailSender.sendEmail.mockRejectedValue(
        new EmailRateLimitException('Email provider rate limit exceeded'),
      );

      mockPrisma.job.findFirst.mockResolvedValue({
        id: jobId,
        status: JobStatus.RUNNING,
        attemptCount: 1,
      });

      const outcome = await worker.processJob(claimedAttempt1);

      expect(outcome).toBe(false);
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
      expect(mockPrisma.campaignContact.update).not.toHaveBeenCalled();
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          availableAt: expect.any(Date),
          lastError: expect.stringContaining('rate limit'),
        },
      });
    });
  });

  describe('processJob - Terminal Failure Path', () => {
    it('on non-retryable provider error, updates EmailSend to FAILED, CampaignContact to FAILED, and Job to FAILED', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId, campaignContactId },
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockEmailSender.sendEmail.mockRejectedValue(
        new EmailProviderException('Domain not verified by provider'),
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
          errorCode: 'PROVIDER_FAILURE',
          errorMessage: 'Domain not verified by provider',
        },
      });

      expect(mockPrisma.campaignContact.update).toHaveBeenCalledWith({
        where: { id: campaignContactId },
        data: { status: CampaignContactStatus.FAILED },
      });

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
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
          payload: { emailSendId, campaignContactId },
        } as any,
        claimedAttempt: 3,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockEmailSender.sendEmail.mockRejectedValue(
        new EmailTimeoutException('Email provider request timed out'),
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
          errorCode: 'PROVIDER_FAILURE',
          errorMessage: expect.stringContaining('timed out'),
        },
      });

      expect(mockPrisma.campaignContact.update).toHaveBeenCalledWith({
        where: { id: campaignContactId },
        data: { status: CampaignContactStatus.FAILED },
      });

      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          failedAt: expect.any(Date),
          lastError: expect.stringContaining('timed out'),
        },
      });
    });
  });

  describe('processJob - Lease Loss Guard', () => {
    it('aborts finalization and does not update EmailSend or Contact if job lease is lost or reclaimed', async () => {
      const claimed: ClaimedEmailJob = {
        job: {
          id: jobId,
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          attemptCount: 1,
          payload: { emailSendId, campaignContactId },
        } as any,
        claimedAttempt: 1,
      };

      mockPrisma.emailSend.findUnique.mockResolvedValue(mockEmailSendRecord);
      mockEmailSender.sendEmail.mockResolvedValue({
        providerMessageId: 'resend-msg-12345',
        rfcMessageId: '<msg-12345@startup.com>',
        sentAt: new Date(),
      });

      // Lease check returns null (e.g. timeout / reassigned)
      mockPrisma.job.findFirst.mockResolvedValue(null);

      const outcome = await worker.processJob(claimed);

      expect(outcome).toBe(false);
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
      expect(mockPrisma.campaignContact.update).not.toHaveBeenCalled();
      expect(mockPrisma.job.update).not.toHaveBeenCalled();
    });
  });
});
