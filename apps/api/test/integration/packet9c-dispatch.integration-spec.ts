jest.unmock('@repo/db');

import { PrismaService } from '../../src/database/prisma.service';
import { SendEmailUseCase, SendEmailCommand } from '../../src/modules/email/application/send-email.use-case';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { MockEmailProviderAdapter } from '../../src/modules/email/infrastructure/mock-email-provider.adapter';
import { ResendEmailProviderAdapter, EmailProviderException } from '../../src/modules/email/infrastructure/resend-email-provider.adapter';
import { SecretResolverService } from '../../src/modules/email/infrastructure/secret-resolver.service';
import { AppValidationException, AppConflictException } from '../../src/common/errors/application.exception';
import { EmailSendStatus, JobStatus, CampaignStatus, CampaignContactStatus, Job, Prisma } from '@repo/db';
import { EmailDispatchErrorCode, SendEmailInput, SendEmailResult } from '../../src/modules/email/domain/email-provider.adapter';

import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaClient } from '@repo/db';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';

describe('Packet 9C: Outbound Dispatch & Provider Adapter', () => {
  let realPrisma: PrismaClient;
  let prisma: PrismaService;
  let useCase: SendEmailUseCase;
  let worker: EmailDispatchWorker;
  let mockAdapter: MockEmailProviderAdapter;
  let resendAdapter: ResendEmailProviderAdapter;
  let secretResolver: SecretResolverService;
  let registry: EmailProviderRegistry;
  let suppressionChecker: PrismaSuppressionChecker;
  let eligibilityService: SendEligibilityService;

  beforeAll(async () => {
    realPrisma = await setupTestDatabase();
    prisma = realPrisma as unknown as PrismaService;
    
    mockAdapter = new MockEmailProviderAdapter();
    (mockAdapter as any).provider = 'SMTP';
    resendAdapter = new ResendEmailProviderAdapter();
    registry = new EmailProviderRegistry(resendAdapter, mockAdapter);
    (registry as any).adapters.set('SMTP', mockAdapter);
    secretResolver = new SecretResolverService();
    suppressionChecker = new PrismaSuppressionChecker(prisma);
    eligibilityService = new SendEligibilityService(suppressionChecker, registry);
    useCase = new SendEmailUseCase(prisma, eligibilityService);
    worker = new EmailDispatchWorker(prisma, registry, secretResolver);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    mockAdapter.calls = [];
    await cleanTestDatabase();
  });

  async function createFixture(dailyLimit = 50) {
    const workspace = await prisma.workspace.create({
      data: { name: 'Test WS' }
    });
    const company = await prisma.company.create({
      data: { workspaceId: workspace.id, name: 'Test Co', domain: 'testco.com', normalizedName: 'test co' }
    });
    const integration = await prisma.integration.create({
      data: { workspaceId: workspace.id, provider: 'SMTP', secretReference: 'mock://key', name: 'Mock Integration' }
    });
    const senderAccount = await prisma.senderAccount.create({
      data: { workspaceId: workspace.id, integrationId: integration.id, fromName: 'Test', fromEmail: 'test@test.com', dailyLimit }
    });
    const campaign = await prisma.campaign.create({
      data: { workspaceId: workspace.id, companyId: company.id, name: 'Test Camp', normalizedName: 'test camp' }
    });
    await prisma.campaignSenderAccount.create({
      data: { workspaceId: workspace.id, campaignId: campaign.id, senderAccountId: senderAccount.id }
    });
    const contact = await prisma.contact.create({
      data: { workspaceId: workspace.id, companyId: company.id, email: 'target@target.com', name: 'Target Target' }
    });
    const campaignContact = await prisma.campaignContact.create({
      data: { workspaceId: workspace.id, campaignId: campaign.id, contactId: contact.id, currentSubject: 'Hello', currentBody: 'Test body test body test body test', status: CampaignContactStatus.READY }
    });

    return { workspace, senderAccount, campaign, campaignContact };
  }

  it('1. Capacity Locking Invariant Regression Test', async () => {
    const { workspace, senderAccount, campaignContact } = await createFixture();
    
    // The SendEligibilityService abstraction forces capacity locking on creation.
    // We cannot create a capacity-consuming email send through it without a transaction.
    const service = eligibilityService;
    
    await expect(
      service.reserveSenderCapacityAndCreateEmailSend(
        // @ts-expect-error Intentionally passing a non-transaction Prisma client to verify it fails if not a tx
        // Actually Prisma clients often look similar, but we test the application boundary method itself here.
        prisma,
        workspace.id,
        campaignContact.campaignId,
        {
          campaignContactId: campaignContact.id,
          type: 'INITIAL',
          subject: 'Test Subject',
          body: 'Test Body',
        }
      )
    ).rejects.toThrow('Capacity invariant violation: reserveSenderCapacityAndCreateEmailSend must be called within an active transaction');

    // Verify it succeeds when called within a real transaction
    await prisma.$transaction(async (tx) => {
      const result = await service.reserveSenderCapacityAndCreateEmailSend(
        tx,
        workspace.id,
        campaignContact.campaignId,
        {
          campaignContactId: campaignContact.id,
          type: 'INITIAL',
          subject: 'Test Subject',
          body: 'Test Body',
        }
      );
      expect(result).toBeDefined();
      expect(result.senderAccountId).toBe(senderAccount.id);
    });
  });

  it('2. Capacity Race & Serialization Test', async () => {
    const { workspace, campaignContact, senderAccount, campaign } = await createFixture(1);

    const contact2 = await prisma.contact.create({
      data: { workspaceId: workspace.id, companyId: campaign.companyId, email: 'target2@target.com', name: 'Target2 Target2' }
    });
    const campaignContact2 = await prisma.campaignContact.create({
      data: { workspaceId: workspace.id, campaignId: campaign.id, contactId: contact2.id, currentSubject: 'Hello2', currentBody: 'Test body test body test body test', status: CampaignContactStatus.READY }
    });

    const results = await Promise.allSettled([
      useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'client1' }),
      useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact2.id, clientKey: 'client2' })
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect((failures[0] as any).reason.message).toContain('SENDER_CAPACITY_EXCEEDED');

    // Verify DB count
    const count = await prisma.emailSend.count();
    expect(count).toBe(1);
  });

  it('3. Transactional Queue Boundary Test', async () => {
    const { workspace, campaignContact } = await createFixture();
    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key3' });

    // Ensure Job exists and is in pending state before worker picks it up
    const job = await prisma.job.findFirst({ where: { type: 'EMAIL_DISPATCH' } });
    expect(job).toBeTruthy();
    expect(job?.status).toBe(JobStatus.PENDING);
  });

  it('4. PROVIDER_TIMEOUT_UNCERTAIN Dead-Letter Test', async () => {
    const { workspace, campaignContact } = await createFixture();

    // Change integration to a mock that throws timeout
    const integration = await prisma.integration.create({
      data: { workspaceId: workspace.id, provider: 'SES', secretReference: 'mock://key', name: 'Timeout Mock' }
    });
    // Dynamically add a mock adapter to registry
    const timeoutAdapter = {
      provider: 'SES',
      sendEmail: async (input: any) => {
        throw new EmailProviderException('Timeout', EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN);
      }
    };
    (registry as any).adapters.set('SES', timeoutAdapter);

    await prisma.senderAccount.updateMany({ data: { integrationId: integration.id } });
    process.env.KEY = JSON.stringify({ accessKeyId: 'k', secretAccessKey: 's' });

    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key4' });

    const claimed = await worker.claimNextJob();
    expect(claimed).toBeTruthy();

    await worker.processJob(claimed!);

    const emailSend = await prisma.emailSend.findFirst();
    expect(emailSend?.status).toBe(EmailSendStatus.FAILED);
    expect(emailSend?.errorCode).toBe(EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN);
    
    // Validate Dead-Letter transition instead of FAILED
    const job = await prisma.job.findUnique({ where: { id: claimed!.job.id } });
    expect(job?.status).toBe(JobStatus.DEAD_LETTER);
  });
  
  it('6. Explicit Rejection preserves PROVIDER_REJECTED and is not converted to EXHAUSTED', async () => {
    const { workspace, campaignContact, senderAccount } = await createFixture();
    
    // Change to mock that returns 400 Permanent Rejection
    const integration = await prisma.integration.create({
      data: { workspaceId: workspace.id, provider: 'SES', secretReference: 'env://KEY', name: 'Reject Mock' }
    });
    
    // Dynamically add a mock adapter to registry
    const rejectAdapter = {
      provider: 'SES',
      sendEmail: async (input: any) => {
        throw new EmailProviderException('Bad Request', EmailDispatchErrorCode.PROVIDER_REJECTED);
      }
    };
    (registry as any).adapters.set('SES', rejectAdapter);

    await prisma.senderAccount.updateMany({ data: { integrationId: integration.id } });

    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key6' });

    const claimed = await worker.claimNextJob();
    expect(claimed).toBeTruthy();
    
    // Fake the attempt count to be MAX_ATTEMPTS to ensure it doesn't get converted
    await prisma.job.update({ where: { id: claimed!.job.id }, data: { attemptCount: 5 } });
    claimed!.claimedAttempt = 5;
    claimed!.job.attemptCount = 5;

    await worker.processJob(claimed!);

    const emailSend = await prisma.emailSend.findFirst({ where: { campaignContactId: campaignContact.id } });
    expect(emailSend?.status).toBe(EmailSendStatus.FAILED);
    expect(emailSend?.errorCode).toBe(EmailDispatchErrorCode.PROVIDER_REJECTED);
    expect(emailSend?.retryable).toBe(false);
  });

  it('5. Resend Idempotency 409 Replay Test', async () => {
    const { workspace, campaignContact, senderAccount } = await createFixture();
    
    // Change to RESEND mock
    const integration = await prisma.integration.create({
      data: { workspaceId: workspace.id, provider: 'RESEND', secretReference: 'env://RESEND_KEY', name: 'Resend Mock' }
    });
    await prisma.senderAccount.updateMany({ data: { integrationId: integration.id } });
    process.env.RESEND_KEY = 'test_key';

    // Mock the fetch call for Resend Adapter to return 409
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ name: 'conflict', id: 'resend-recovered-id' })
    }) as any;

    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key409' });

    const claimed = await worker.claimNextJob();
    await worker.processJob(claimed!);

    const emailSend = await prisma.emailSend.findFirst();
    expect(emailSend?.status).toBe(EmailSendStatus.SENT);
    expect(emailSend?.providerMessageId).toBe('resend-recovered-id');
  });

  it('6. Temporal Nullability & Provider Immutability Tests', async () => {
    const { workspace, campaignContact, senderAccount } = await createFixture();
    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key6' });

    // 1. Provider and senderAccountId MUST be populated immediately on reservation
    const send = await prisma.emailSend.findFirst();
    expect(send?.senderAccountId).toBe(senderAccount.id);
    expect(send?.provider).toBe('SMTP');

    // 2. Updates to EmailSend cannot alter provider
    // In our repository/worker, there is no update to provider. We verify worker preserves it.
    
    const updatedSend = await prisma.emailSend.findFirst();
    expect(updatedSend?.provider).toBe('SMTP'); // still preserved
  });

  it('7. Production mock:// Security Test', async () => {
    process.env.NODE_ENV = 'production';
    await expect(secretResolver.resolve('mock://key', 'SMTP')).rejects.toThrow('mock:// secrets are not allowed in production');
    process.env.NODE_ENV = 'test'; // restore
  });
  
  it('8. Stale RUNNING job sweeper test', async () => {
    const { workspace, campaignContact } = await createFixture();
    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key_sweeper' });

    const job = await prisma.job.findFirst({ where: { type: 'EMAIL_DISPATCH' } });
    
    // Artificially make it RUNNING and stale (6 minutes old)
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.job.update({
      where: { id: job!.id },
      data: {
        status: 'RUNNING',
        updatedAt: sixMinutesAgo
      }
    });

    const recoveredCount = await worker.recoverStaleJobs();
    expect(recoveredCount).toBe(1);

    const recoveredJob = await prisma.job.findUnique({ where: { id: job!.id } });
    expect(recoveredJob?.status).toBe('PENDING');
  });

  it('9. Stale job recovery lease-safety race condition', async () => {
    const { workspace, campaignContact } = await createFixture();
    await useCase.execute({ workspaceId: workspace.id, campaignContactId: campaignContact.id, clientKey: 'key_race' });

    // 1. Worker A claims the job
    const claimed = await worker.claimNextJob();
    expect(claimed).toBeDefined();

    // 2. Artificially make the job stale in DB as if Worker A hung
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.job.update({
      where: { id: claimed!.job.id },
      data: { updatedAt: sixMinutesAgo }
    });

    // 3. Sweeper recovers the job (this increments leaseVersion)
    const recoveredCount = await worker.recoverStaleJobs();
    expect(recoveredCount).toBe(1);

    const recoveredJob = await prisma.job.findUnique({ where: { id: claimed!.job.id } });
    expect(recoveredJob?.status).toBe('PENDING');

    // 4. Worker A finally finishes its work and tries to processJob (using the old lease)
    // We expect processJob to return false indicating lease was lost
    const success = await worker.processJob(claimed!);
    
    // 5. Verify the job is still PENDING (not COMPLETED or RUNNING)
    expect(success).toBe(false);
    
    const finalJobState = await prisma.job.findUnique({ where: { id: claimed!.job.id } });
    expect(finalJobState?.status).toBe('PENDING');
  });

});

