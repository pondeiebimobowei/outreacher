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
  getTestPgPool,
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
import {
  AppConflictException,
  AppUnprocessableEntityException,
} from '../../src/common/errors/application.exception';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');
jest.setTimeout(30000);

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
  it('2. Enforces idempotency semantics: replay with identical key and payload returns existing send; same key with different payload throws 409 conflict', async () => {
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
    const payloadA = { channel: 'EMAIL', clientVariant: 'A' };
    const payloadB = { channel: 'EMAIL', clientVariant: 'B' };

    // Request A: Idempotency-Key = K, same valid outreach, first request -> succeeds
    const firstResult = await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: canonicalKey,
      payload: payloadA,
    });
    expect(firstResult.status).toBe('QUEUED');
    expect(firstResult.jobId).toBeDefined();

    // Request B: SAME Idempotency-Key = K, DIFFERENT request payload -> 409 conflict
    const conflictPromise = sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: canonicalKey,
      payload: payloadB,
    });
    await expect(conflictPromise).rejects.toThrow(AppConflictException);
    await expect(conflictPromise).rejects.toThrow(
      'Idempotency key reused with different request payload',
    );

    // Assert: exactly one idempotency record for K
    const idempRecords = await prisma.idempotencyRecord.findMany({
      where: {
        workspaceId: currentWorkspaceId,
        key: canonicalKey,
      },
    });
    expect(idempRecords).toHaveLength(1);
    expect(idempRecords[0].jobId).toBe(firstResult.jobId);

    // Assert: exactly one logical EmailSend
    const totalSends = await prisma.emailSend.count({
      where: { outreachId: outreachDto.id },
    });
    expect(totalSends).toBe(1);

    // Assert: exactly one logical send job
    const totalJobs = await prisma.job.count({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'EMAIL_DISPATCH',
      },
    });
    expect(totalJobs).toBe(1);

    // Assert: original request/result remains intact (replay with same key and payload succeeds)
    const replayResult = await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: canonicalKey,
      payload: payloadA,
    });
    expect(replayResult.jobId).toBe(firstResult.jobId);
    expect(replayResult.status).toBe('QUEUED');

    // Distinct idempotency key against already SENDING outreach also conflicts
    await expect(
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
        idempotencyKey: 'different-idem-key-67890',
      }),
    ).rejects.toThrow(AppConflictException);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Same CampaignRecipient Concurrency (Gap 1)
  // ─────────────────────────────────────────────────────────────────────────────
  it('7. Handles concurrent operations on same CampaignRecipient: prevents duplicate Outreach/EmailSend, enforces lifecycle and campaign eligibility', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'samerecipient@load.test',
      'Same Recipient Co',
      'Same',
      'Recipient',
    );

    const template = await createTemplateUseCase.execute(currentWorkspaceId, {
      name: 'Recipient Concurrency Template',
      steps: [
        {
          sequence: 0,
          subjectTemplate: 'Hello {{contact.firstName}}',
          bodyTemplate: 'Step 0 body for {{company.name}}',
        },
      ],
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Recipient Concurrency Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 0,
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

    // Phase A: Concurrent Outreach Creation against same CampaignRecipient
    const createResults = await Promise.allSettled([
      createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          campaignRecipientId: recipient.id,
          personCompanyAssociationId: pca.id,
        },
        'create-key-1',
      ),
      createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          campaignRecipientId: recipient.id,
          personCompanyAssociationId: pca.id,
        },
        'create-key-2',
      ),
    ]);

    const createdFulfilled = createResults.filter((r) => r.status === 'fulfilled');
    const createdRejected = createResults.filter((r) => r.status === 'rejected');

    // Exactly 1 creates the Outreach, second is rejected with 409 AppConflictException
    expect(createdFulfilled).toHaveLength(1);
    expect(createdRejected).toHaveLength(1);

    const rejectionReason = (createdRejected[0] as PromiseRejectedResult).reason;
    expect(
      rejectionReason instanceof AppConflictException ||
        (rejectionReason as any)?.code === 'P2002',
    ).toBe(true);

    // Exactly 1 Outreach row in PostgreSQL
    const outreachCount = await prisma.outreach.count({
      where: { campaignRecipientId: recipient.id },
    });
    expect(outreachCount).toBe(1);

    const winningOutreach = (createdFulfilled[0] as PromiseFulfilledResult<any>).value;

    // Approve the outreach draft
    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: winningOutreach.id,
    });

    // Phase B: Concurrent Send against same CampaignRecipient's Outreach
    const sendResults = await Promise.allSettled([
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: winningOutreach.id,
        idempotencyKey: 'send-key-1',
      }),
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: winningOutreach.id,
        idempotencyKey: 'send-key-2',
      }),
    ]);

    const sendFulfilled = sendResults.filter((r) => r.status === 'fulfilled');
    const sendRejected = sendResults.filter((r) => r.status === 'rejected');

    // Exactly 1 send reservation succeeds, 1 fails
    expect(sendFulfilled).toHaveLength(1);
    expect(sendRejected).toHaveLength(1);

    const sendRejection = (sendRejected[0] as PromiseRejectedResult).reason;
    expect(sendRejection).toBeInstanceOf(AppConflictException);

    // Verification of final database state:
    // 1. Recipient lifecycle status strictly ACTIVE (not corrupted or completed prematurely)
    const finalRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(finalRecipient.status).toBe(CampaignRecipientStatus.ACTIVE);

    // 2. Exactly 1 EmailSend record (sequence 0)
    const sendRecords = await prisma.emailSend.findMany({
      where: { outreachId: winningOutreach.id },
    });
    expect(sendRecords).toHaveLength(1);
    expect(sendRecords[0].sequence).toBe(0);
    expect(sendRecords[0].status).toBe(EmailSendStatus.RESERVED);

    // 3. Exactly 1 EMAIL_DISPATCH job (0 conflicting sends)
    const dispatchJobs = await prisma.job.findMany({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'EMAIL_DISPATCH',
      },
    });
    expect(dispatchJobs).toHaveLength(1);

    // 4. Outreach status is SENDING
    const finalOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: winningOutreach.id },
    });
    expect(finalOutreach.status).toBe(OutreachStatus.SENDING);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Same PCA Concurrency & Conversation State Invariants (Gap 2)
  // ─────────────────────────────────────────────────────────────────────────────
  it('8. Enforces PCA conversation-state invariants: REPLIED/STOPPED cannot be bypassed, and concurrent sends do not advance stateVersion twice', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);

    // Part A: REPLIED cannot be bypassed by concurrent send (throws 409 AppConflictException)
    const { pca: pcaReplied } = await seedContact(
      currentWorkspaceId,
      'replied.guard@domain.test',
      'Replied Guard Co',
      'Rep',
      'Guard',
    );
    await prisma.personCompanyAssociation.update({
      where: { id: pcaReplied.id },
      data: { conversationState: ConversationState.REPLIED, stateVersion: 1 },
    });

    const campaignA = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Replied Guard Campaign',
        status: CampaignStatus.ACTIVE,
        maxFollowUps: 0,
        campaignSenderAccounts: { create: [{ senderAccountId: sender.id }] },
      },
    });

    const recipientA = await prisma.campaignRecipient.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaignA.id,
        personCompanyAssociationId: pcaReplied.id,
        status: CampaignRecipientStatus.PENDING,
      },
    });

    const outreachA = await prisma.outreach.create({
      data: {
        workspaceId: currentWorkspaceId,
        personCompanyAssociationId: pcaReplied.id,
        campaignRecipientId: recipientA.id,
        senderAccountId: sender.id,
        contentSource: 'MANUAL',
        subject: 'Bypass Attempt',
        message: 'Body',
        status: OutreachStatus.APPROVED,
        maxFollowUps: 0,
      },
    });

    await expect(
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachA.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(AppConflictException);

    // Part B: STOPPED cannot be bypassed by send (throws 422 AppUnprocessableEntityException)
    const { pca: pcaStopped } = await seedContact(
      currentWorkspaceId,
      'stopped.guard@domain.test',
      'Stopped Guard Co',
      'Stop',
      'Guard',
    );
    await prisma.personCompanyAssociation.update({
      where: { id: pcaStopped.id },
      data: { conversationState: ConversationState.STOPPED, stateVersion: 1 },
    });

    const outreachB = await prisma.outreach.create({
      data: {
        workspaceId: currentWorkspaceId,
        personCompanyAssociationId: pcaStopped.id,
        senderAccountId: sender.id,
        contentSource: 'MANUAL',
        subject: 'Stopped Send Attempt',
        message: 'Body',
        status: OutreachStatus.APPROVED,
        maxFollowUps: 0,
      },
    });

    await expect(
      sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachB.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(AppUnprocessableEntityException);

    // Part C: Multiple concurrent sends/dispatches cannot advance PCA stateVersion twice
    const { pca: pcaConcurrent } = await seedContact(
      currentWorkspaceId,
      'cas.advance@domain.test',
      'CAS Advance Co',
      'Cas',
      'Advance',
    );

    // Initial state: NO_REPLY, stateVersion = 0
    expect(pcaConcurrent.conversationState).toBe(ConversationState.NO_REPLY);
    expect(pcaConcurrent.stateVersion).toBe(0);

    // Create 2 one-off outreaches on the same PCA
    const outreach1 = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pcaConcurrent.id,
        contentSource: 'MANUAL',
        subject: 'CAS Outreach 1',
        message: 'Body 1',
        senderAccountId: sender.id,
        maxFollowUps: 0,
      },
      randomUUID(),
    );
    const outreach2 = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pcaConcurrent.id,
        contentSource: 'MANUAL',
        subject: 'CAS Outreach 2',
        message: 'Body 2',
        senderAccountId: sender.id,
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    await approveDraftUseCase.execute({ workspaceId: currentWorkspaceId, outreachId: outreach1.id });
    await approveDraftUseCase.execute({ workspaceId: currentWorkspaceId, outreachId: outreach2.id });

    await sendOutreachUseCase.execute({ workspaceId: currentWorkspaceId, outreachId: outreach1.id, idempotencyKey: randomUUID() });
    await sendOutreachUseCase.execute({ workspaceId: currentWorkspaceId, outreachId: outreach2.id, idempotencyKey: randomUUID() });

    // Process dispatch job 1
    const job1 = await dispatchWorker.claimNextJob();
    expect(job1).not.toBeNull();
    const result1 = await dispatchWorker.processJob(job1!);
    expect(result1).toBe(true);

    const pcaAfterFirstDispatch = await prisma.personCompanyAssociation.findUniqueOrThrow({
      where: { id: pcaConcurrent.id },
    });
    // First dispatch advanced NO_REPLY -> ACTIVE (stateVersion 0 -> 1)
    expect(pcaAfterFirstDispatch.conversationState).toBe(ConversationState.ACTIVE);
    expect(pcaAfterFirstDispatch.stateVersion).toBe(1);

    // Process dispatch job 2
    const job2 = await dispatchWorker.claimNextJob();
    expect(job2).not.toBeNull();
    const result2 = await dispatchWorker.processJob(job2!);
    expect(result2).toBe(true);

    const pcaAfterSecondDispatch = await prisma.personCompanyAssociation.findUniqueOrThrow({
      where: { id: pcaConcurrent.id },
    });
    // Second dispatch found PCA already ACTIVE -> stateVersion must NOT be incremented again!
    expect(pcaAfterSecondDispatch.conversationState).toBe(ConversationState.ACTIVE);
    expect(pcaAfterSecondDispatch.stateVersion).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Template Mutation / Consumption Concurrency with PostgreSQL Locks (Gap 6)
  // ─────────────────────────────────────────────────────────────────────────────
  it('9. Overlaps template structural mutation with campaign consumption under PostgreSQL row locks: race cannot produce structurally invalid active campaign', async () => {
    await seedSenderAccount(currentWorkspaceId);

    const template = await createTemplateUseCase.execute(currentWorkspaceId, {
      name: 'Locked Template Concurrency',
      steps: [
        { sequence: 0, subjectTemplate: 'Step 0: {{contact.firstName}}', bodyTemplate: 'Body 0' },
        { sequence: 1, subjectTemplate: 'Step 1: {{contact.firstName}}', bodyTemplate: 'Body 1' },
      ],
    });

    const pool = getTestPgPool();
    const client = await pool.connect();
    const campaignId = randomUUID();

    try {
      await client.query('BEGIN');

      // Acquire exclusive row lock on the template row in PostgreSQL
      await client.query('SELECT id FROM email_templates WHERE id = $1 FOR UPDATE', [template.id]);

      // Insert active campaign inside transaction (same connection, no FK deadlock)
      await client.query(
        `INSERT INTO campaigns (id, workspace_id, name, status, content_source, template_id, max_follow_ups, updated_at) 
         VALUES ($1, $2, $3, 'ACTIVE', 'TEMPLATE', $4, 1, NOW())`,
        [campaignId, currentWorkspaceId, 'Concurrent Locked Campaign', template.id],
      );

      // Start concurrent mutation in background (blocks on SELECT ... FOR UPDATE in PostgreSQL)
      const mutationPromise = setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
        steps: [{ sequence: 0, subjectTemplate: 'Modified Step 0', bodyTemplate: 'Body' }],
      }).catch((err) => err);

      // Brief delay to allow mutation query to queue behind the exclusive PostgreSQL lock
      await new Promise((r) => setTimeout(r, 100));

      // Commit transaction, releasing the template lock
      await client.query('COMMIT');

      // The unblocked mutation executes its validation, finds the active campaign, and throws AppConflictException
      const mutationError = await mutationPromise;
      expect(mutationError).toBeInstanceOf(AppConflictException);
    } finally {
      client.release();
    }

    // Verify template steps in PostgreSQL remain structurally valid and intact (0 and 1 exist)
    const steps = await prisma.emailTemplateStep.findMany({
      where: { templateId: template.id },
      orderBy: { sequence: 'asc' },
    });
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.sequence)).toEqual([0, 1]);
  });
});
