import {
  CampaignMemberStatus,
  CampaignStatus,
  EmailSendStatus,
  JobStatus,
  PrismaClient,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { SendEmailUseCase } from '../../src/modules/email/application/send-email.use-case';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { MockEmailSender } from '../../src/modules/email/infrastructure/mock-email-sender';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { SecretResolverService } from '../../src/modules/email/infrastructure/secret-resolver.service';
import { AppConflictException } from '../../src/common/errors/application.exception';
import { CampaignContactStatus } from '@repo/shared';

jest.unmock('@repo/db');

describe('Email Dispatch & Idempotency Concurrency (PostgreSQL Integration)', () => {
  let realPrisma: PrismaClient;
  let prismaService: PrismaService;
  let useCase: SendEmailUseCase;
  let worker: EmailDispatchWorker;
  let mockSender: MockEmailSender;

  let workspaceId: string;
  let companyId: string;

  beforeAll(async () => {
    realPrisma = await setupTestDatabase();
    prismaService = realPrisma as unknown as PrismaService;
    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    const registry = new EmailProviderRegistry(null as any, null as any);
    (registry as any).adapters = new Map();
    mockSender = new MockEmailSender();
    (registry as any).adapters.set('RESEND', mockSender);
    const eligibilityService = new SendEligibilityService(
      suppressionChecker,
      registry,
    );
    useCase = new SendEmailUseCase(prismaService, eligibilityService);
    const secretResolver = new SecretResolverService();
    worker = new EmailDispatchWorker(prismaService, registry, secretResolver);
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    const workspace = await realPrisma.workspace.create({
      data: { name: 'Dispatch Concurrency WS' },
    });
    workspaceId = workspace.id;

    const company = await realPrisma.company.create({
      data: {
        workspaceId,
        name: 'Target Company Inc',
        normalizedName: 'target company inc',
        domain: 'target.com',
      },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedContactAndCampaign(params?: {
    contactEmail?: string;
    campaignStatus?: CampaignStatus;
    contactStatus?: CampaignContactStatus;
    campaignName?: string;
  }) {
    const email = params?.contactEmail || 'founder@target.com';
    const status = params?.campaignStatus || CampaignStatus.DRAFT;
    const contactStatus = params?.contactStatus || 'READY';
    const campaignName =
      params?.campaignName ||
      `Q3 Outbound Campaign ${Math.random().toString(36).substring(2, 9)}`;
    const normalizedName = campaignName.toLowerCase();

    const contact = await realPrisma.campaignMember.create({
      data: {
        workspaceId,
        personId: 'person-1',
        campaignId: '',
        
        
      },
    });

    const campaign = await realPrisma.campaign.create({
      data: {
        workspaceId,
        companyId,
        name: campaignName,
        templateId: '',

        normalizedName,
        status,
        senderAccountId: 'sales@startup.com',
      },
    });

    const campaignMember = await realPrisma.campaignMember.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        personId: '',
        status: contactStatus,
        currentSubject: 'Accelerate your pipeline with AI',
        currentBody:
          'Hi Jane, I noticed your team is scaling outbound sales. Would love to show you a quick demo.',
      },
    });

    const integration = await realPrisma.integration.create({
      data: {
        workspaceId,
        provider: 'RESEND',
        name: 'Resend Integ ' + Math.random(),
        secretReference: 'mock://resend',
      },
    });

    const senderAccount = await realPrisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: integration.id,
        fromName: 'Jane',
        fromEmail: 'sales' + Math.random() + '@startup.com',
        dailyLimit: 50,
      },
    });

    await realPrisma.campaignSenderAccount.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        senderAccountId: senderAccount.id,
      },
    });

    return { contact, campaign, campaignMember };
  }

  describe('Contract 1: same key + same contact concurrency', () => {
    it('creates exactly one reservation/job and all callers replay 202 with identical jobId', async () => {
      const { campaignMember } = await seedContactAndCampaign({
        campaignStatus: CampaignStatus.DRAFT,
      });

      const clientKey = 'idemp-key-concurrent-single-contact-123';
      const CONCURRENCY_COUNT = 8;

      // Fire CONCURRENCY_COUNT simultaneous dispatch requests for the exact same contact and key
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY_COUNT }).map(() =>
          useCase.execute({
            workspaceId,
            campaignMemberId: campaignMember.id,
            clientKey,
          }),
        ),
      );

      // Verify all callers received a successful response
      expect(results).toHaveLength(CONCURRENCY_COUNT);
      const firstJobId = results[0].jobId;
      expect(firstJobId).toBeDefined();

      // All returned the exact same jobId and message
      for (const res of results) {
        expect(res.jobId).toBe(firstJobId);
        expect(res.message).toBe('Dispatch enqueued');
      }

      // Verify PostgreSQL database state: exactly ONE of each record created
      const sends = await realPrisma.emailSend.findMany({
        where: { campaignMemberId: campaignMember.id },
      });
      expect(sends).toHaveLength(1);
      expect(sends[0].status).toBe(EmailSendStatus.RESERVED);
      expect(sends[0].subject).toBe('Accelerate your pipeline with AI');

      const jobs = await realPrisma.job.findMany({
        where: { workspaceId, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(firstJobId);
      expect(jobs[0].status).toBe(JobStatus.PENDING);
      expect(jobs[0].idempotencyKey).toContain('send:');

      const idempRecords = await realPrisma.idempotencyRecord.findMany({
        where: { workspaceId, key: clientKey },
      });
      expect(idempRecords).toHaveLength(1);
      expect(idempRecords[0].targetId).toBe(campaignMember.id);
      expect(idempRecords[0].jobId).toBe(firstJobId);
      expect(idempRecords[0].responseStatus).toBe(202);

      const updatedContact = await realPrisma.campaignMember.findUnique({
        where: { id: campaignMember.id },
      });
      expect(updatedContact?.status).toBe(CampaignMemberStatus.SENDING);

      const updatedCampaign = await realPrisma.campaign.findUnique({
        where: { id: campaignMember.campaignId },
      });
      expect(updatedCampaign?.status).toBe(CampaignStatus.ACTIVE);
    });
  });

  describe('Contract 2: different keys + different contacts on concurrent DRAFT campaign', () => {
    it('both reservations succeed, campaign transitions DRAFT -> ACTIVE, and 2 distinct jobs are queued', async () => {
      // Seed single DRAFT campaign with two READY contacts
      const campaign = await realPrisma.campaign.create({
        data: {
          workspaceId,
          companyId,
          name: 'Concurrent Multi-Contact Outreach',
          normalizedName: 'concurrent multi-contact outreach',
          status: CampaignStatus.DRAFT,
          senderAccountId: 'founder@startup.com',
          templateId: '',
        },
      });

      const integration = await realPrisma.integration.create({
        data: {
          workspaceId,
          provider: 'RESEND',
          name: 'Resend C2',
          secretReference: 'mock://c2',
        },
      });
      const senderAccount = await realPrisma.senderAccount.create({
        data: {
          workspaceId,
          integrationId: integration.id,
          fromName: 'C2',
          fromEmail: 'c2@startup.com',
        },
      });
      await realPrisma.campaignSenderAccount.create({
        data: {
          workspaceId,
          campaignId: campaign.id,
          senderAccountId: senderAccount.id,
        },
      });

      const contactA = await realPrisma.person.create({
        data: {
          workspaceId,
          email: 'contact.a@target.com',
          firstName: 'Contact',
          lastName: 'A',
        },
      });
      const campaignContactA = await realPrisma.campaignMember.create({
        data: {
          workspaceId,
          campaignId: campaign.id,
          personId: contactA.id,
          status: 'READY',
          currentSubject: 'Outreach Subject A',
          currentBody:
            'Outreach message body A that exceeds twenty characters.',
        },
      });

      const contactB = await realPrisma.person.create({
        data: {
          workspaceId,
          email: 'contact.b@target.com',
          firstName: 'Contact',
          lastName: 'B',
        },
      });
      const campaignContactB = await realPrisma.campaignMember.create({
        data: {
          workspaceId,
          campaignId: campaign.id,
          personId: contactB.id,
          status: "READY",
          currentSubject: 'Outreach Subject B',
          currentBody:
            'Outreach message body B that exceeds twenty characters.',
        },
      });

      const keyA = 'idemp-key-contact-a-456';
      const keyB = 'idemp-key-contact-b-789';

      // Send concurrently against Contact A and Contact B on the same DRAFT campaign
      const [resA, resB] = await Promise.all([
        useCase.execute({
          workspaceId,
          campaignMemberId: campaignContactA.id,
          clientKey: keyA,
        }),
        useCase.execute({
          workspaceId,
          campaignMemberId: campaignContactB.id,
          clientKey: keyB,
        }),
      ]);

      expect(resA.jobId).toBeDefined();
      expect(resB.jobId).toBeDefined();
      expect(resA.jobId).not.toBe(resB.jobId);
      expect(resA.message).toBe('Dispatch enqueued');
      expect(resB.message).toBe('Dispatch enqueued');

      // Campaign successfully transitioned to ACTIVE
      const updatedCampaign = await realPrisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updatedCampaign?.status).toBe(CampaignStatus.ACTIVE);

      // Both contacts transitioned to SENDING
      const [updatedA, updatedB] = await Promise.all([
        realPrisma.campaignMember.findUnique({
          where: { id: campaignContactA.id },
        }),
        realPrisma.campaignMember.findUnique({
          where: { id: campaignContactB.id },
        }),
      ]);
      expect(updatedA?.status).toBe("SENDING");
      expect(updatedB?.status).toBe("SENDING");

      // Two distinct EmailSend records created in RESERVED status
      const sends = await realPrisma.emailSend.findMany({
        where: { campaignId: campaign.id },
      });
      expect(sends).toHaveLength(2);
      expect(sends.every((s) => s.status === EmailSendStatus.RESERVED)).toBe(
        true,
      );

      // Two distinct Jobs created in PENDING status
      const jobs = await realPrisma.job.findMany({
        where: { workspaceId, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.status === JobStatus.PENDING)).toBe(true);
    });
  });

  describe('Contract 3: Concurrent Idempotency Key Cross-Contact Collision', () => {
    it('when 2 parallel requests use the same Idempotency-Key for different contacts, exactly one commits and the other throws 409', async () => {
      const { campaignMember: contactA } = await seedContactAndCampaign({
        contactEmail: 'userA@target.com',
      });
      const { campaignMember: contactB } = await seedContactAndCampaign({
        contactEmail: 'userB@target.com',
      });

      const collisionKey = 'idemp-key-concurrent-cross-contact-collision';

      // Launch both requests simultaneously in real PostgreSQL
      const results = await Promise.allSettled([
        useCase.execute({
          workspaceId,
          campaignMemberId: contactA.id,
          clientKey: collisionKey,
        }),
        useCase.execute({
          workspaceId,
          campaignMemberId: contactB.id,
          clientKey: collisionKey,
        }),
      ]);

      // Exactly one fulfilled (202 response) and exactly one rejected (409 AppConflictException)
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const winningResult = (fulfilled[0] as PromiseFulfilledResult<any>).value;
      expect(winningResult.jobId).toBeDefined();
      expect(winningResult.message).toBe('Dispatch enqueued');

      const rejectionReason = rejected[0].reason;
      expect(rejectionReason).toBeInstanceOf(AppConflictException);
      expect(rejectionReason.message).toContain(
        `Idempotency-Key '${collisionKey}' was already used for a different campaign contact`,
      );

      // Verify database state:
      // Exactly 1 IdempotencyRecord
      const idempRecords = await realPrisma.idempotencyRecord.findMany({
        where: { workspaceId, key: collisionKey },
      });
      expect(idempRecords).toHaveLength(1);
      const winningTargetId = idempRecords[0].targetId;

      // Exactly 1 Job
      const jobs = await realPrisma.job.findMany({
        where: { workspaceId, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(winningResult.jobId);

      // Exactly 1 EmailSend
      const sends = await realPrisma.emailSend.findMany({
        where: { workspaceId },
      });
      expect(sends).toHaveLength(1);
      expect(sends[0].campaignMemberId).toBe(winningTargetId);
      expect(sends[0].status).toBe(EmailSendStatus.RESERVED);

      // Winning contact is SENDING
      const winningContact = await realPrisma.campaignMember.findUnique({
        where: { id: winningTargetId },
      });
      expect(winningContact?.status).toBe("SENDING");

      // Losing contact remains READY
      const losingTargetId =
        winningTargetId === contactA.id ? contactB.id : contactA.id;
      const losingContact = await realPrisma.campaignMember.findUnique({
        where: { id: losingTargetId },
      });
      expect(losingContact?.status).toBe("READY");
    });
  });

  describe('Contract 4: Full Worker Claim and Finalization in Real PostgreSQL', () => {
    it('claims job with FOR UPDATE SKIP LOCKED, executes provider dispatch, and updates all records to SENT', async () => {
      const { campaignMember } = await seedContactAndCampaign();

      // 1. Reserve dispatch via use-case
      const reservation = await useCase.execute({
        workspaceId,
        campaignMemberId: campaignMember.id,
        clientKey: 'key-worker-e2e-real-db',
      });
      expect(reservation.jobId).toBeDefined();

      // 2. Worker claims job
      const claimed = await worker.claimNextJob();
      expect(claimed).not.toBeNull();
      expect(claimed!.job.id).toBe(reservation.jobId);
      expect(claimed!.claimedAttempt).toBe(1);

      // Verify DB state right after claim:
      // Job is RUNNING, EmailSend is SENDING, CampaignContact is SENDING
      const runningJob = await realPrisma.job.findUnique({
        where: { id: reservation.jobId },
      });
      expect(runningJob?.status).toBe(JobStatus.RUNNING);
      expect(runningJob?.attemptCount).toBe(1);

      const sendingSend = await realPrisma.emailSend.findFirst({
        where: { campaignMemberId: campaignMember.id },
      });
      expect(sendingSend?.status).toBe(EmailSendStatus.SENDING);

      // 3. Worker processes claimed job
      const success = await worker.processJob(claimed!);
      expect(success).toBe(true);

      // 4. Verify finalized database state
      const completedJob = await realPrisma.job.findUnique({
        where: { id: reservation.jobId },
      });
      expect(completedJob?.status).toBe(JobStatus.COMPLETED);
      expect(completedJob?.completedAt).toBeDefined();

      const sentEmail = await realPrisma.emailSend.findFirst({
        where: { campaignMemberId: campaignMember.id },
      });
      expect(sentEmail?.status).toBe(EmailSendStatus.SENT);
      expect(sentEmail?.sentAt).toBeDefined();
      expect(sentEmail?.providerMessageId).toBeDefined();
      // RFC Message-ID must match <uuid@domain> format
      expect(sentEmail?.messageId).toMatch(/^<[a-f0-9-]+@[^>]+>$/);
      // Provider Message ID and RFC Message ID must be distinct values
      expect(sentEmail?.providerMessageId).not.toBe(sentEmail?.messageId);

      const sentContact = await realPrisma.campaignMember.findUnique({
        where: { id: campaignMember.id },
      });
      expect(sentContact?.status).toBe("SENT");

      // Subsequent claim finds no more eligible jobs
      const noMoreJobs = await worker.claimNextJob();
      expect(noMoreJobs).toBeNull();
    });
  });
});
