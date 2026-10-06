import {
  PrismaClient,
  CampaignStatus,
  CampaignRecipientStatus,
  OutreachStatus,
  EmailSendStatus,
  JobStatus,
  IntegrationProvider,
  IntegrationStatus,
  SenderStatus,
  ConversationState,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { CreateOutreachUseCase } from '../../src/modules/outreach/application/create-outreach.use-case';
import { ApproveDraftUseCase } from '../../src/modules/outreach/application/approve-draft.use-case';
import { SendOutreachUseCase } from '../../src/modules/outreach/application/send-outreach.use-case';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { ScheduleFollowUpUseCase } from '../../src/modules/email/application/schedule-follow-up.use-case';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { CreateTemplateUseCase } from '../../src/modules/template/application/create-template.use-case';
import { SetTemplateStepsUseCase } from '../../src/modules/template/application/set-template-steps.use-case';
import { DeleteTemplateUseCase } from '../../src/modules/template/application/delete-template.use-case';
import { MarkContactRepliedUseCase } from '../../src/modules/email/application/mark-contact-replied.use-case';
import { AppConflictException } from '../../src/common/errors/application.exception';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: Concurrency, Worker Leasing & Reply Interactions (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let templateEngine: TemplateEngineService;
  let createTemplateUseCase: CreateTemplateUseCase;
  let setTemplateStepsUseCase: SetTemplateStepsUseCase;
  let deleteTemplateUseCase: DeleteTemplateUseCase;
  let createOutreachUseCase: CreateOutreachUseCase;
  let approveDraftUseCase: ApproveDraftUseCase;
  let sendOutreachUseCase: SendOutreachUseCase;
  let markContactRepliedUseCase: MarkContactRepliedUseCase;
  let scheduleFollowUpUseCase: ScheduleFollowUpUseCase;
  let dispatchWorker: EmailDispatchWorker;
  let mockProviderAdapter: any;

  let currentWorkspaceId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    templateEngine = new TemplateEngineService();

    mockProviderAdapter = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'prov-concurrency-msg-1',
        messageId: '<concurrency-test-1@example.com>',
      }),
      verifyConnection: jest.fn().mockResolvedValue(true),
      idempotencyWindowMs: 24 * 60 * 60 * 1000,
    };

    const providerRegistry = {
      hasAdapter: jest.fn().mockReturnValue(true),
      getAdapter: jest.fn().mockReturnValue(mockProviderAdapter),
    } as unknown as EmailProviderRegistry;

    const mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'RESEND',
        apiKey: 'resend-concurrency-key',
      }),
    };

    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    const eligibilityService = new SendEligibilityService(
      suppressionChecker,
      providerRegistry,
    );

    createTemplateUseCase = new CreateTemplateUseCase(prismaService, templateEngine);
    setTemplateStepsUseCase = new SetTemplateStepsUseCase(prismaService, templateEngine);
    deleteTemplateUseCase = new DeleteTemplateUseCase(prismaService);
    createOutreachUseCase = new CreateOutreachUseCase(prismaService, templateEngine);
    approveDraftUseCase = new ApproveDraftUseCase(prismaService);
    sendOutreachUseCase = new SendOutreachUseCase(prismaService, eligibilityService);
    markContactRepliedUseCase = new MarkContactRepliedUseCase(prismaService);
    scheduleFollowUpUseCase = new ScheduleFollowUpUseCase(prismaService);

    dispatchWorker = new EmailDispatchWorker(
      prismaService,
      providerRegistry,
      mockSecretResolver,
      scheduleFollowUpUseCase,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();

    const ws = await prisma.workspace.create({
      data: { name: 'Concurrency & Leasing Workspace' },
    });
    currentWorkspaceId = ws.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedSenderAccount(workspaceId: string, dailyLimit = 100) {
    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        name: 'Resend Provider',
        provider: IntegrationProvider.RESEND,
        status: IntegrationStatus.ACTIVE,
        secretReference: 'resend-concurrency-secret',
      },
    });

    return prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: integration.id,
        fromEmail: 'sales@pipeline.test',
        fromName: 'Sales Lead',
        status: SenderStatus.ACTIVE,
        dailyLimit,
      },
    });
  }

  async function seedContact(
    workspaceId: string,
    email: string,
    companyName: string,
    firstName: string,
    lastName: string,
  ) {
    const company = await prisma.company.create({
      data: {
        workspaceId,
        name: companyName,
        normalizedName: companyName.toLowerCase(),
        domain: `${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      },
    });

    const person = await prisma.person.create({
      data: {
        workspaceId,
        email,
        firstName,
        lastName,
      },
    });

    const pca = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId,
        companyId: company.id,
        personId: person.id,
        workEmail: email,
        conversationState: ConversationState.NO_REPLY,
        stateVersion: 0,
      },
    });

    return { company, person, pca };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Section 10: Concurrent Send Reservation on Same Outreach
  // ─────────────────────────────────────────────────────────────────────────────
  it('1. Handles concurrent send reservation on same Outreach: exactly 1 succeeds, second fails with 409 conflict', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'concurrent@target.example.com',
      'Target Co',
      'Con',
      'Current',
    );

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'MANUAL',
        subject: 'Concurrency Test',
        message: 'Concurrency Test Message',
        senderAccountId: sender.id,
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    // Launch 2 concurrent sends with distinct idempotency keys
    const sendKey1 = randomUUID();
    const sendKey2 = randomUUID();

    const results = await Promise.allSettled([
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
        idempotencyKey: sendKey1,
      }),
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
        idempotencyKey: sendKey2,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed in transitioning to SENDING
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Rejected one must fail with AppConflictException
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(AppConflictException);

    // Database verification: Exactly 1 EmailSend created, exactly 1 EMAIL_DISPATCH job created
    const sendsCount = await prisma.emailSend.count({
      where: { outreachId: outreachDto.id },
    });
    expect(sendsCount).toBe(1);

    const jobsCount = await prisma.job.count({
      where: { workspaceId: currentWorkspaceId, type: 'EMAIL_DISPATCH' },
    });
    expect(jobsCount).toBe(1);

    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).toBe(OutreachStatus.SENDING);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Section 12: Idempotent Replay Semantics
  // ─────────────────────────────────────────────────────────────────────────────
  it('2. Enforces idempotency semantics: replay with identical key returns existing send; distinct key conflicts', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'idempotent@target.example.com',
      'Target Co',
      'Idem',
      'Potent',
    );

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'MANUAL',
        subject: 'Idempotency Test',
        message: 'Idempotency Test Message',
        senderAccountId: sender.id,
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    const canonicalKey = 'idem-unique-key-12345';

    // First call
    const firstResult = await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: canonicalKey,
    });

    // Second call with EXACT SAME idempotency key (must return existing send without error)
    const secondResult = await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: canonicalKey,
    });

    expect(secondResult.jobId).toBe(firstResult.jobId);
    expect(secondResult.status).toBe('QUEUED');

    // Third call with DIFFERENT idempotency key -> MUST throw 409 AppConflictException
    await expect(
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
        idempotencyKey: 'different-idem-key-67890',
      }),
    ).rejects.toThrow(AppConflictException);

    // Exactly 1 EmailSend record in PostgreSQL
    const totalSends = await prisma.emailSend.count({
      where: { outreachId: outreachDto.id },
    });
    expect(totalSends).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Section 10: Sender Daily Limit Capacity Concurrency
  // ─────────────────────────────────────────────────────────────────────────────
  it('3. Enforces sender daily capacity limit under concurrent PostgreSQL load: caps strictly at dailyLimit', async () => {
    // Sender with daily limit = 2
    const sender = await seedSenderAccount(currentWorkspaceId, 2);

    // Create 4 distinct contacts and outreaches
    const outreaches = [];
    for (let i = 0; i < 4; i++) {
      const { pca } = await seedContact(
        currentWorkspaceId,
        `cap${i}@loadtest.example.com`,
        `LoadTest Co ${i}`,
        `Lead${i}`,
        `Test`,
      );

      const o = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          contentSource: 'MANUAL',
          subject: `Daily Limit Subject ${i}`,
          message: `Daily Limit Message ${i}`,
          senderAccountId: sender.id,
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      await approveDraftUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: o.id,
      });

      outreaches.push(o);
    }

    // Launch all 4 sends concurrently
    const results = await Promise.allSettled(
      outreaches.map((o) =>
        sendOutreachUseCase.execute({
          workspaceId: currentWorkspaceId,
          outreachId: o.id,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 2 must succeed, 2 must fail due to limit exhaustion
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(2);

    for (const r of rejected) {
      const error = (r as PromiseRejectedResult).reason;
      expect(error.message).toMatch(/limit|capacity|quota/i);
    }

    // Assert database state: exactly 2 EmailSends created for this sender
    const dbSends = await prisma.emailSend.count({
      where: { senderAccountId: sender.id },
    });
    expect(dbSends).toBe(2);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Section 10 & 4: Active Campaign Template Mutation Conflict
  // ─────────────────────────────────────────────────────────────────────────────
  it('4. Enforces template structural mutation protection when referenced by active campaign (throws 409 AppConflictException)', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);

    const template = await createTemplateUseCase.execute(currentWorkspaceId, {
      name: 'Active Campaign Protected Template',
      steps: [
        {
          sequence: 0,
          subjectTemplate: 'Hello {{contact.firstName}}',
          bodyTemplate: 'Step 0 body for {{company.name}}',
        },
        {
          sequence: 1,
          subjectTemplate: 'Re: Hello {{contact.firstName}}',
          bodyTemplate: 'Step 1 body for {{company.name}}',
        },
      ],
    });

    // Create and activate Campaign referencing this template
    await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Lock Hierarchy Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 1,
        campaignSenderAccounts: {
          create: [{ senderAccountId: sender.id }],
        },
      },
    });

    // 1. Attempting to set steps that remove required sequence 1 MUST fail with AppConflictException
    await expect(
      setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Modified Step 0',
            bodyTemplate: 'Modified body',
          },
        ],
      }),
    ).rejects.toThrow(AppConflictException);

    // 2. Attempting to hard-delete the template MUST fail with AppConflictException
    await expect(
      deleteTemplateUseCase.execute(currentWorkspaceId, template.id),
    ).rejects.toThrow(AppConflictException);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Section 11: Worker Lease Fencing on Real PostgreSQL
  // ─────────────────────────────────────────────────────────────────────────────
  it('5. Enforces worker lease fencing: aborts post-dispatch transition if lease generation was lost/bumped', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'lease@target.example.com',
      'Target Co',
      'Lease',
      'Fencing',
    );

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'MANUAL',
        subject: 'Lease Fencing Test',
        message: 'Lease Fencing Body',
        senderAccountId: sender.id,
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: randomUUID(),
    });

    // Worker claims the job
    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const originalLeaseVersion = claimedJob!.job.leaseVersion;

    // Simulate concurrent worker reclaiming or modifying the job:
    // Bump the leaseVersion in PostgreSQL before dispatchWorker processes the job
    await prisma.job.update({
      where: { id: claimedJob!.job.id },
      data: { leaseVersion: originalLeaseVersion + 1 },
    });

    // Process job with stale lease version in memory
    const processResult = await dispatchWorker.processJob(claimedJob!);
    // Result should be false because leaseCheck.count === 0
    expect(processResult).toBe(false);

    // Verify EmailSend was NOT updated to SENT (remains SENDING or PENDING)
    const emailSend = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(emailSend.status).not.toBe(EmailSendStatus.SENT);

    // Verify Outreach was NOT updated to ACTIVE
    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).not.toBe(OutreachStatus.ACTIVE);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Section 14: Outcome & Inbound Reply Interactions
  // ─────────────────────────────────────────────────────────────────────────────
  it('6. Inbound reply outcome interaction: marks PCA REPLIED, cancels pending follow-up checks, and completes CampaignRecipients', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'replier@partner.example.com',
      'Partner Co',
      'Rep',
      'Lier',
    );

    const template = await createTemplateUseCase.execute(currentWorkspaceId, {
      name: 'Reply Outcome Template',
      steps: [
        {
          sequence: 0,
          subjectTemplate: 'Hello {{contact.firstName}}',
          bodyTemplate: 'Checking in with {{company.name}}',
        },
        {
          sequence: 1,
          subjectTemplate: 'Re: Hello {{contact.firstName}}',
          bodyTemplate: 'Following up with {{company.name}}',
        },
      ],
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Reply Outcome Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 1,
        campaignSenderAccounts: {
          create: [{ senderAccountId: sender.id }],
        },
      },
    });

    const recipient = await prisma.campaignRecipient.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        personCompanyAssociationId: pca.id,
        status: CampaignRecipientStatus.PENDING,
      },
    });

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        campaignRecipientId: recipient.id,
        personCompanyAssociationId: pca.id,
      },
      randomUUID(),
    );

    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: randomUUID(),
    });

    // Dispatch sequence 0 successfully so follow-up check job is scheduled
    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const dispatchOk = await dispatchWorker.processJob(claimedJob!);
    expect(dispatchOk).toBe(true);

    // Verify SCHEDULED_FOLLOW_UP_CHECK job was created
    const pendingFollowUpJob = await prisma.job.findFirst({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        status: JobStatus.PENDING,
      },
    });
    expect(pendingFollowUpJob).not.toBeNull();

    // Now, inbound reply arrives!
    await markContactRepliedUseCase.execute(pca.id, currentWorkspaceId);

    // 1. Verify PCA transitioned to REPLIED with incremented stateVersion
    const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
      where: { id: pca.id },
    });
    expect(updatedPca.conversationState).toBe(ConversationState.REPLIED);
    expect(updatedPca.stateVersion).toBeGreaterThan(0);

    // 2. Verify pending follow-up job transitioned to CANCELLED
    const cancelledJob = await prisma.job.findUniqueOrThrow({
      where: { id: pendingFollowUpJob!.id },
    });
    expect(cancelledJob.status).toBe(JobStatus.CANCELLED);
    expect((cancelledJob as any).cancellationReason).toBe('CANCELLED_BY_USER');

    // 3. Verify CampaignRecipient transitioned to COMPLETED
    const updatedRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updatedRecipient.status).toBe(CampaignRecipientStatus.COMPLETED);
  });
});
