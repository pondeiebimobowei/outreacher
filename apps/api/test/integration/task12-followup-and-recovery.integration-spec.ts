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
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: Follow-Up Progression & EmailSend Recovery Semantics (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let templateEngine: TemplateEngineService;
  let createOutreachUseCase: CreateOutreachUseCase;
  let approveDraftUseCase: ApproveDraftUseCase;
  let sendOutreachUseCase: SendOutreachUseCase;
  let dispatchWorker: EmailDispatchWorker;
  let followUpWorker: ScheduledFollowUpCheckWorker;
  let mockProviderAdapter: any;

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

    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    const eligibilityService = new SendEligibilityService(
      suppressionChecker,
      providerRegistry,
    );

    createOutreachUseCase = new CreateOutreachUseCase(prismaService, templateEngine);
    approveDraftUseCase = new ApproveDraftUseCase(prismaService);
    sendOutreachUseCase = new SendOutreachUseCase(prismaService, eligibilityService);

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
});
