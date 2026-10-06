import {
  PrismaClient,
  CampaignStatus,
  CampaignRecipientStatus,
  OutreachStatus,
  EmailSendStatus,
  EmailSendType,
  JobStatus,
  IntegrationProvider,
  IntegrationStatus,
  SenderStatus,
  ConversationState,
  Prisma,
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
import { ScheduledFollowUpCheckWorker } from '../../src/modules/email/application/scheduled-follow-up-check.worker';
import { ScheduleFollowUpUseCase } from '../../src/modules/email/application/schedule-follow-up.use-case';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { SetTemplateStepsUseCase } from '../../src/modules/template/application/set-template-steps.use-case';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { AIProvider } from '../../src/modules/outreach/domain/ai-provider.interface';
import { randomUUID } from 'crypto';

function createBarrier(): { wait: () => Promise<void>; release: () => void } {
  let resolve: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    wait: () => promise,
    release: () => resolve(),
  };
}

jest.unmock('@repo/db');
jest.setTimeout(30000);

describe('Task 12: Follow-Up Progression & EmailSend Recovery Semantics (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let templateEngine: TemplateEngineService;
  let eligibilityService: SendEligibilityService;
  let createOutreachUseCase: CreateOutreachUseCase;
  let approveDraftUseCase: ApproveDraftUseCase;
  let sendOutreachUseCase: SendOutreachUseCase;
  let setTemplateStepsUseCase: SetTemplateStepsUseCase;
  let dispatchWorker: EmailDispatchWorker;
  let followUpWorker: ScheduledFollowUpCheckWorker;
  let mockProviderAdapter: any;
  let mockAiProvider: jest.Mocked<AIProvider>;

  let currentWorkspaceId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    templateEngine = new TemplateEngineService();

    mockProviderAdapter = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'provider-followup-msg-1',
        messageId: '<followup-1@test.com>',
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
        apiKey: 'resend-test-key',
      }),
    };

    mockAiProvider = {
      complete: jest.fn(),
    };

    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    eligibilityService = new SendEligibilityService(
      suppressionChecker,
      providerRegistry,
    );

    createOutreachUseCase = new CreateOutreachUseCase(prismaService, templateEngine);
    approveDraftUseCase = new ApproveDraftUseCase(prismaService);
    sendOutreachUseCase = new SendOutreachUseCase(prismaService, eligibilityService);
    setTemplateStepsUseCase = new SetTemplateStepsUseCase(prismaService, templateEngine);

    const scheduleFollowUpUseCase = new ScheduleFollowUpUseCase(prismaService);

    dispatchWorker = new EmailDispatchWorker(
      prismaService,
      providerRegistry,
      mockSecretResolver,
      scheduleFollowUpUseCase,
    );

    followUpWorker = new ScheduledFollowUpCheckWorker(
      prismaService,
      templateEngine,
      eligibilityService,
      mockAiProvider,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();

    const ws = await prisma.workspace.create({
      data: { name: 'Follow-Up & Recovery Workspace' },
    });
    currentWorkspaceId = ws.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedSenderAccount(workspaceId: string) {
    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        name: 'Resend Integration',
        provider: IntegrationProvider.RESEND,
        status: IntegrationStatus.ACTIVE,
        secretReference: 'resend-key-ref',
      },
    });

    return prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: integration.id,
        fromEmail: 'alex@company.example.com',
        fromName: 'Alex Rivera',
        status: SenderStatus.ACTIVE,
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
      data: { workspaceId, email, firstName, lastName },
    });

    const pca = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId,
        personId: person.id,
        companyId: company.id,
        role: 'VP Engineering',
        workEmail: email,
        conversationState: 'NO_REPLY',
      },
    });

    return { company, person, pca };
  }

  it('1. Advances full follow-up progression: seq 0 -> seq 1 -> seq 2, enforcing unique sequence and recipient completion', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'michael@target.example.com',
      'Target Tech',
      'Michael',
      'Scott',
    );

    // 1. Create 3-step Template: sequence 0, 1, 2
    const template = await prisma.emailTemplate.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: '3-Step Sequence Template',
        steps: {
          create: [
            { sequence: 0, subjectTemplate: 'Step 0: Intro to {{contact.firstName}}', bodyTemplate: 'Hello {{contact.firstName}} at {{company.name}}' },
            { sequence: 1, subjectTemplate: 'Step 1: Re: Intro to {{contact.firstName}}', bodyTemplate: 'Following up on our note.' },
            { sequence: 2, subjectTemplate: 'Step 2: Final note for {{contact.firstName}}', bodyTemplate: 'Closing the loop.' },
          ],
        },
      },
    });

    // 2. Create Campaign: maxFollowUps = 2 (requires seq 0, 1, 2)
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Follow-Up Sequence Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 2,
        followUpDelayBusinessDays: 1,
      },
    });

    await prisma.campaignSenderAccount.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        senderAccountId: sender.id,
        status: 'ACTIVE',
      },
    });

    // 3. Create CampaignRecipient
    const recipient = await prisma.campaignRecipient.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        personCompanyAssociationId: pca.id,
        status: CampaignRecipientStatus.PENDING,
      },
    });

    // 4. Create Outreach for recipient
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipient.id,
      },
      randomUUID(),
    );

    // 5. Approve draft and send Initial Outreach (Sequence 0)
    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: randomUUID(),
    });

    // Worker dispatches sequence 0
    const job0 = await dispatchWorker.claimNextJob();
    expect(job0).not.toBeNull();
    const success0 = await dispatchWorker.processJob(job0!);
    expect(success0).toBe(true);

    // Verify sequence 0 is SENT
    const send0 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 0 },
    });
    expect(send0.status).toBe(EmailSendStatus.SENT);

    // Assert SCHEDULED_FOLLOW_UP_CHECK job was scheduled for sequence 1
    const followUpJob1Record = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
      },
    });
    expect((followUpJob1Record.payload as any).sequence).toBe(1);

    // 6. Execute Follow-Up Worker for Sequence 1
    // Make job available immediately for test
    await prisma.job.update({
      where: { id: followUpJob1Record.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    const claimedFollowUp1 = await followUpWorker.claimNextJob();
    expect(claimedFollowUp1).not.toBeNull();
    const followUpSuccess1 = await followUpWorker.processJob(claimedFollowUp1!);
    expect(followUpSuccess1).toBe(true);

    // Assert sequence 1 EmailSend created (RESERVED) and EMAIL_DISPATCH job enqueued
    const send1 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 1 },
    });
    expect(send1.type).toBe(EmailSendType.FOLLOW_UP);
    expect(send1.status).toBe(EmailSendStatus.RESERVED);

    // Dispatch Worker sends sequence 1
    const dispatchJob1 = await dispatchWorker.claimNextJob();
    expect(dispatchJob1).not.toBeNull();
    const dispatchSuccess1 = await dispatchWorker.processJob(dispatchJob1!);
    expect(dispatchSuccess1).toBe(true);

    const completedSend1 = await prisma.emailSend.findUniqueOrThrow({
      where: { id: send1.id },
    });
    expect(completedSend1.status).toBe(EmailSendStatus.SENT);

    // 7. Execute Follow-Up Worker for Sequence 2 (final sequence)
    const followUpJob2Record = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        idempotencyKey: `follow-up:${outreachDto.id}:2`,
      },
    });

    await prisma.job.update({
      where: { id: followUpJob2Record.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    const claimedFollowUp2 = await followUpWorker.claimNextJob();
    expect(claimedFollowUp2).not.toBeNull();
    const followUpSuccess2 = await followUpWorker.processJob(claimedFollowUp2!);
    expect(followUpSuccess2).toBe(true);

    const send2 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 2 },
    });
    expect(send2.sequence).toBe(2);
    expect(send2.status).toBe(EmailSendStatus.RESERVED);

    // Dispatch sequence 2
    const dispatchJob2 = await dispatchWorker.claimNextJob();
    expect(dispatchJob2).not.toBeNull();
    const dispatchSuccess2 = await dispatchWorker.processJob(dispatchJob2!);
    expect(dispatchSuccess2).toBe(true);

    // 8. Assert all sequences completed and CampaignRecipient transitioned to COMPLETED
    const finalRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(finalRecipient.status).toBe(CampaignRecipientStatus.COMPLETED);

    // 9. Enforce database boundary constraint: duplicate (outreachId, sequence) MUST fail
    await expect(
      prisma.emailSend.create({
        data: {
          workspaceId: currentWorkspaceId,
          outreachId: outreachDto.id,
          senderAccountId: sender.id,
          sequence: 1, // Duplicate sequence 1
          type: EmailSendType.FOLLOW_UP,
          subject: 'Duplicate Sequence Subject',
          body: 'Duplicate Sequence Body',
          status: EmailSendStatus.PENDING,
        },
      }),
    ).rejects.toThrow();
  });

  it('2. Enforces EmailSend retry row reuse, recovery semantics (SENDING -> PENDING), and firstProviderAttemptAt preservation', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'pam@paperco.example.com',
      'PaperCo',
      'Pam',
      'Beesly',
    );

    // Create One-Off Outreach
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'MANUAL',
        subject: 'Retry Recovery Verification',
        message: 'Testing row reuse and recovery semantics.',
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

    const initialSend = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(initialSend.status).toBe(EmailSendStatus.RESERVED);
    expect(initialSend.firstProviderAttemptAt).toBeNull();

    // 1. Simulate Transient Failure on Attempt 1
    mockProviderAdapter.sendEmail.mockRejectedValueOnce(
      new Error('network connection failure: transient 503'),
    );

    const claimedJobAttempt1 = await dispatchWorker.claimNextJob();
    expect(claimedJobAttempt1).not.toBeNull();
    const result1 = await dispatchWorker.processJob(claimedJobAttempt1!);
    expect(result1).toBe(false);

    // Assert EmailSend recovered from SENDING -> PENDING (same row reused!)
    const sendAfterAttempt1 = await prisma.emailSend.findUniqueOrThrow({
      where: { id: initialSend.id },
    });
    expect(sendAfterAttempt1.status).toBe(EmailSendStatus.PENDING);
    expect(sendAfterAttempt1.firstProviderAttemptAt).not.toBeNull();
    const firstAttemptTimestamp = sendAfterAttempt1.firstProviderAttemptAt!;

    // Assert Job recovered: RUNNING -> PENDING with backoff
    const jobAfterAttempt1 = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJobAttempt1!.job.id },
    });
    expect(jobAfterAttempt1.status).toBe(JobStatus.PENDING);
    expect(jobAfterAttempt1.attemptCount).toBe(1);

    // 2. Simulate Success on Attempt 2
    // Reset availableAt to simulate backoff passing
    await prisma.job.update({
      where: { id: jobAfterAttempt1.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    mockProviderAdapter.sendEmail.mockResolvedValueOnce({
      providerMessageId: 'recovered-provider-msg-777',
      messageId: '<recovered-777@test.com>',
    });

    const claimedJobAttempt2 = await dispatchWorker.claimNextJob();
    expect(claimedJobAttempt2).not.toBeNull();
    const result2 = await dispatchWorker.processJob(claimedJobAttempt2!);
    expect(result2).toBe(true);

    // Assert same EmailSend row updated to SENT
    const sendAfterAttempt2 = await prisma.emailSend.findUniqueOrThrow({
      where: { id: initialSend.id },
    });
    expect(sendAfterAttempt2.status).toBe(EmailSendStatus.SENT);
    expect(sendAfterAttempt2.providerMessageId).toBe('recovered-provider-msg-777');
    // firstProviderAttemptAt MUST be preserved from attempt 1
    expect(sendAfterAttempt2.firstProviderAttemptAt?.getTime()).toBe(firstAttemptTimestamp.getTime());

    // Assert exactly 1 EmailSend record exists for this outreach
    const totalSends = await prisma.emailSend.count({
      where: { outreachId: outreachDto.id },
    });
    expect(totalSends).toBe(1);
  });

  it('3. Template future-follow-up mutation: updating template step content preserves initial outreach draft snapshot and renders updated content for subsequent sequence', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'dwight@dundermifflin.example.com',
      'Dunder Mifflin',
      'Dwight',
      'Schrute',
    );

    // 1. Create Template with initial Step 0 and Step 1
    const template = await prisma.emailTemplate.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Mutable Follow-Up Sequence',
        steps: {
          create: [
            {
              sequence: 0,
              subjectTemplate: 'Initial intro to {{contact.firstName}}',
              bodyTemplate: 'Step 0 body for {{company.name}}',
            },
            {
              sequence: 1,
              subjectTemplate: 'Original follow-up for {{contact.firstName}}',
              bodyTemplate: 'Step 1 original body for {{company.name}}',
            },
          ],
        },
      },
    });

    // 2. Create Active Campaign requiring steps 0..1
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Template Follow-Up Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 1,
        followUpDelayBusinessDays: 1,
      },
    });

    await prisma.campaignSenderAccount.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        senderAccountId: sender.id,
        status: 'ACTIVE',
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

    // 3. Create Outreach: initial draft must snapshot Step 0
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipient.id,
      },
      randomUUID(),
    );

    expect(outreachDto.subject).toBe('Initial intro to Dwight');
    expect(outreachDto.message).toBe('Step 0 body for Dunder Mifflin');

    // 4. Update Template Step 1 content via SetTemplateStepsUseCase
    // Retains sequence 0 & 1, but modifies Step 1 content
    await setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
      steps: [
        {
          sequence: 0,
          subjectTemplate: 'Initial intro to {{contact.firstName}}',
          bodyTemplate: 'Step 0 body for {{company.name}}',
        },
        {
          sequence: 1,
          subjectTemplate: 'UPDATED Step 1 for {{contact.firstName}}',
          bodyTemplate: 'UPDATED Step 1 body for {{company.name}}',
        },
      ],
    });

    // 5. Approve draft and send Outreach (Sequence 0)
    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: randomUUID(),
    });

    // Worker dispatches sequence 0
    const job0 = await dispatchWorker.claimNextJob();
    expect(job0).not.toBeNull();
    const success0 = await dispatchWorker.processJob(job0!);
    expect(success0).toBe(true);

    const send0 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 0 },
    });
    expect(send0.status).toBe(EmailSendStatus.SENT);
    expect(send0.subject).toBe('Initial intro to Dwight');

    // Assert initial outreach draft content remains strictly untouched in DB
    const outreachAfter = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreachAfter.subject).toBe('Initial intro to Dwight');
    expect(outreachAfter.message).toBe('Step 0 body for Dunder Mifflin');

    // 6. Execute Follow-Up Worker for Sequence 1
    const followUpJobRecord = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
      },
    });

    await prisma.job.update({
      where: { id: followUpJobRecord.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    const claimedFollowUp = await followUpWorker.claimNextJob();
    expect(claimedFollowUp).not.toBeNull();
    const followUpSuccess = await followUpWorker.processJob(claimedFollowUp!);
    expect(followUpSuccess).toBe(true);

    // 7. Verify sequence 1 EmailSend used the UPDATED template step content!
    const send1 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 1 },
    });
    expect(send1.type).toBe(EmailSendType.FOLLOW_UP);
    expect(send1.status).toBe(EmailSendStatus.RESERVED);
    expect(send1.subject).toBe('UPDATED Step 1 for Dwight');
    expect(send1.body).toBe('UPDATED Step 1 body for Dunder Mifflin');

    // Dispatch sequence 1
    const dispatchJob1 = await dispatchWorker.claimNextJob();
    expect(dispatchJob1).not.toBeNull();
    const dispatchSuccess1 = await dispatchWorker.processJob(dispatchJob1!);
    expect(dispatchSuccess1).toBe(true);

    const completedSend1 = await prisma.emailSend.findUniqueOrThrow({
      where: { id: send1.id },
    });
    expect(completedSend1.status).toBe(EmailSendStatus.SENT);

    // Campaign recipient reaches COMPLETED
    const finalRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(finalRecipient.status).toBe(CampaignRecipientStatus.COMPLETED);
  });

  it('4. AI follow-up 3-phase protocol: synthesizes follow-up outside DB locks, and cleanly aborts reservation if contact replies during synthesis', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'jim@dundermifflin.example.com',
      'Dunder Mifflin',
      'Jim',
      'Halpert',
    );

    // 1. Create AI Campaign with maxFollowUps = 1
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'AI Follow-Up Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'AI',
        aiPromptContext: 'Focus on paper supply advantages.',
        maxFollowUps: 1,
        followUpDelayBusinessDays: 1,
      },
    });

    await prisma.campaignSenderAccount.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        senderAccountId: sender.id,
        status: 'ACTIVE',
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

    // 2. Create Outreach
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipient.id,
      },
      randomUUID(),
    );

    // Seed initial message and subject for draft approval
    await prisma.outreach.update({
      where: { id: outreachDto.id },
      data: {
        subject: 'Initial AI outreach to Jim',
        message: 'Initial message proposing partnership',
      },
    });

    await approveDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
    });

    await sendOutreachUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      idempotencyKey: randomUUID(),
    });

    // Worker dispatches sequence 0
    const job0 = await dispatchWorker.claimNextJob();
    expect(job0).not.toBeNull();
    const success0 = await dispatchWorker.processJob(job0!);
    expect(success0).toBe(true);

    const send0 = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id, sequence: 0 },
    });
    expect(send0.status).toBe(EmailSendStatus.SENT);

    // 3. Setup AI provider barrier for Phase 2 synthesis
    const followUpJobRecord = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
      },
    });

    await prisma.job.update({
      where: { id: followUpJobRecord.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });

    const llmStarted = createBarrier();
    const llmCanFinish = createBarrier();
    let llmCallCount = 0;

    mockAiProvider.complete.mockImplementationOnce(async () => {
      llmCallCount++;
      llmStarted.release();
      await llmCanFinish.wait();
      return {
        rawText: JSON.stringify({
          subject: 'AI In-Flight Follow-up to Jim',
          body: 'Following up with Jim on paper pricing.',
        }),
      };
    });

    // 4. Claim follow-up job (Phase 1 begins and completes)
    const claimedJob = await followUpWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();

    // Start Phase 2 in worker
    const workerPromise = followUpWorker.processJob(claimedJob!);

    // Wait until worker is inside Phase 2 (external LLM call outside DB locks)
    await llmStarted.wait();
    expect(llmCallCount).toBe(1);

    // 5. Simulate Contact REPLIED while LLM was computing
    await prisma.personCompanyAssociation.update({
      where: { id: pca.id },
      data: {
        conversationState: ConversationState.REPLIED,
        stateVersion: { increment: 1 },
      },
    });

    // 6. Release LLM to proceed to Phase 3 (re-validation & atomic reservation)
    llmCanFinish.release();
    const workerResult = await workerPromise;

    // Worker must detect invalid state in Phase 3 and abort
    expect(workerResult).toBe(false);

    // 7. Assert follow-up job is CANCELLED with CANCELLED_BY_USER
    const jobAfterAbort = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJob!.job.id },
    });
    expect(jobAfterAbort.status).toBe(JobStatus.CANCELLED);
    expect(jobAfterAbort.cancellationReason).toBe('CANCELLED_BY_USER');

    // 8. Assert NO sequence 1 EmailSend was created
    const send1 = await prisma.emailSend.findFirst({
      where: { outreachId: outreachDto.id, sequence: 1 },
    });
    expect(send1).toBeNull();

    // 9. Assert NO EMAIL_DISPATCH job was enqueued for follow-up
    const pendingDispatchJobs = await prisma.job.findMany({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'EMAIL_DISPATCH',
        status: JobStatus.PENDING,
      },
    });
    expect(pendingDispatchJobs).toHaveLength(0);

    // 10. Assert PCA conversationState remains REPLIED
    const pcaAfter = await prisma.personCompanyAssociation.findUniqueOrThrow({
      where: { id: pca.id },
    });
    expect(pcaAfter.conversationState).toBe(ConversationState.REPLIED);
  });
});
