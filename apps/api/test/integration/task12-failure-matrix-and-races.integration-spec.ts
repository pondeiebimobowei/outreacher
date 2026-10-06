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
  SuppressionReason,
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
import { SuppressContactUseCase } from '../../src/modules/contact/application/suppress-contact.use-case';
import { UnsuppressContactUseCase } from '../../src/modules/contact/application/unsuppress-contact.use-case';
import { CreateTemplateUseCase } from '../../src/modules/template/application/create-template.use-case';
import { EmailDispatchErrorCode } from '../../src/modules/email/domain/email-provider.adapter';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: Failure Matrix, Post-Dispatch Races & Suppression Invariants (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let templateEngine: TemplateEngineService;
  let createTemplateUseCase: CreateTemplateUseCase;
  let createOutreachUseCase: CreateOutreachUseCase;
  let approveDraftUseCase: ApproveDraftUseCase;
  let sendOutreachUseCase: SendOutreachUseCase;
  let suppressContactUseCase: SuppressContactUseCase;
  let unsuppressContactUseCase: UnsuppressContactUseCase;
  let dispatchWorker: EmailDispatchWorker;
  let scheduleFollowUpUseCase: ScheduleFollowUpUseCase;
  let mockProviderAdapter: any;

  let currentWorkspaceId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    templateEngine = new TemplateEngineService();

    mockProviderAdapter = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'prov-fail-msg-1',
        messageId: '<fail-test-1@example.com>',
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
        apiKey: 'resend-fail-key',
      }),
    };

    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    const eligibilityService = new SendEligibilityService(
      suppressionChecker,
      providerRegistry,
    );

    createTemplateUseCase = new CreateTemplateUseCase(prismaService, templateEngine);
    createOutreachUseCase = new CreateOutreachUseCase(prismaService, templateEngine);
    approveDraftUseCase = new ApproveDraftUseCase(prismaService);
    sendOutreachUseCase = new SendOutreachUseCase(prismaService, eligibilityService);
    suppressContactUseCase = new SuppressContactUseCase(prismaService);
    unsuppressContactUseCase = new UnsuppressContactUseCase(prismaService);

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
      data: { name: 'Failure & Races Test Workspace' },
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
        name: 'Resend Test Provider',
        provider: IntegrationProvider.RESEND,
        status: IntegrationStatus.ACTIVE,
        secretReference: 'resend-test-secret',
      },
    });

    return prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: integration.id,
        fromEmail: 'alex@startup.io',
        fromName: 'Alex Founder',
        status: SenderStatus.ACTIVE,
        dailyLimit: 200,
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

  async function seedCampaignWithTemplate(
    workspaceId: string,
    senderId: string,
    maxFollowUps = 1,
  ) {
    const steps = [];
    for (let i = 0; i <= maxFollowUps; i++) {
      steps.push({
        sequence: i,
        subjectTemplate:
          i === 0
            ? 'Hello {{contact.firstName}}'
            : `Re: Hello {{contact.firstName}} (step ${i})`,
        bodyTemplate: `Checking in with {{company.name}} for step ${i}`,
      });
    }

    const template = await createTemplateUseCase.execute(workspaceId, {
      name: `Template ${randomUUID().slice(0, 8)}`,
      steps,
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        name: `Campaign ${randomUUID().slice(0, 8)}`,
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps,
        campaignSenderAccounts: {
          create: [
            {
              senderAccountId: senderId,
            },
          ],
        },
      },
    });

    return { campaign, template };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Permanent Provider Failure
  // ─────────────────────────────────────────────────────────────────────────────
  it('1. Handles permanent provider failure: EmailSend FAILED, Outreach FAILED, Recipient FAILED, PCA released to NO_REPLY', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'invalid@baddomain.test',
      'Bad Domain Inc',
      'Bad',
      'Recipient',
    );

    const { campaign } = await seedCampaignWithTemplate(currentWorkspaceId, sender.id, 1);

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

    // Mock permanent failure: non-transient, non-timeout
    mockProviderAdapter.sendEmail.mockRejectedValueOnce(
      new Error('Permanent rejection: 550 Mailbox not found'),
    );

    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const result = await dispatchWorker.processJob(claimedJob!);
    expect(result).toBe(false);

    // Verify EmailSend -> FAILED
    const send = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(send.status).toBe(EmailSendStatus.FAILED);
    expect(send.retryable).toBe(false);
    expect(send.errorMessage).toContain('Mailbox not found');

    // Verify Outreach -> FAILED
    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).toBe(OutreachStatus.FAILED);

    // Verify CampaignRecipient -> FAILED
    const updatedRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updatedRecipient.status).toBe(CampaignRecipientStatus.FAILED);

    // Verify Job -> DEAD_LETTER
    const deadJob = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJob!.job.id },
    });
    expect(deadJob.status).toBe(JobStatus.DEAD_LETTER);

    // Verify PCA release: conversationState remains / releases to NO_REPLY
    const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
      where: { id: pca.id },
    });
    expect(updatedPca.conversationState).toBe(ConversationState.NO_REPLY);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Provider Uncertain Timeout
  // ─────────────────────────────────────────────────────────────────────────────
  it('2. Handles uncertain provider timeout: marks DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION and DEAD_LETTER', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'timeout@client.test',
      'Timeout Client Co',
      'Time',
      'Out',
    );

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'MANUAL',
        subject: 'Timeout Test',
        message: 'Timeout Test Body',
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

    mockProviderAdapter.sendEmail.mockRejectedValueOnce(
      new Error('Gateway timeout from downstream mail server'),
    );

    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const result = await dispatchWorker.processJob(claimedJob!);
    expect(result).toBe(false);

    const send = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(send.status).toBe(EmailSendStatus.FAILED);
    expect(send.errorCode).toBe(
      EmailDispatchErrorCode.DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION,
    );

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJob!.job.id },
    });
    expect(job.status).toBe(JobStatus.DEAD_LETTER);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Pre-Dispatch Campaign Pause Boundary
  // ─────────────────────────────────────────────────────────────────────────────
  it('3. Pre-dispatch campaign pause boundary: cancels EmailSend, pauses Outreach, marks Job COMPLETED(cancellationReason=PAUSED)', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'pause@test.org',
      'Pause Org',
      'Pause',
      'User',
    );

    const { campaign } = await seedCampaignWithTemplate(currentWorkspaceId, sender.id, 1);

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

    // Campaign is PAUSED before worker claims job
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.PAUSED },
    });

    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const result = await dispatchWorker.processJob(claimedJob!);
    expect(result).toBe(false);

    // EmailSend should be CANCELLED
    const send = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(send.status).toBe(EmailSendStatus.CANCELLED);

    // Outreach should be PAUSED
    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).toBe(OutreachStatus.PAUSED);

    // Job should be COMPLETED with cancellationReason = PAUSED
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJob!.job.id },
    });
    expect(job.status).toBe(JobStatus.COMPLETED);
    expect((job as any).cancellationReason).toBe('PAUSED');

    // Provider was NEVER called
    expect(mockProviderAdapter.sendEmail).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Pre-Dispatch Recipient Suppression Boundary
  // ─────────────────────────────────────────────────────────────────────────────
  it('4. Pre-dispatch recipient suppression boundary: cancels send and pauses outreach with cancellationReason=SUPPRESSED', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'suppressed@target.org',
      'Target Suppressed Co',
      'Supp',
      'Ressed',
    );

    const { campaign } = await seedCampaignWithTemplate(currentWorkspaceId, sender.id, 1);

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

    // Recipient becomes SUPPRESSED before worker processes
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: CampaignRecipientStatus.SUPPRESSED },
    });

    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const result = await dispatchWorker.processJob(claimedJob!);
    expect(result).toBe(false);

    const send = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(send.status).toBe(EmailSendStatus.CANCELLED);

    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).toBe(OutreachStatus.PAUSED);

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: claimedJob!.job.id },
    });
    expect(job.status).toBe(JobStatus.COMPLETED);
    expect((job as any).cancellationReason).toBe('SUPPRESSED');

    expect(mockProviderAdapter.sendEmail).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Section 8: Post-Dispatch Pause Race
  // ─────────────────────────────────────────────────────────────────────────────
  it('5. Post-dispatch pause race: marks EmailSend SENT, keeps Outreach PAUSED, and schedules 0 follow-up jobs', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);
    const { pca } = await seedContact(
      currentWorkspaceId,
      'racer@fastco.example.com',
      'FastCo',
      'Ray',
      'Cer',
    );

    const { campaign } = await seedCampaignWithTemplate(currentWorkspaceId, sender.id, 2);

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

    // Simulate concurrent pause during external API dispatch:
    // When sendEmail is called, pause the campaign in PostgreSQL before sendEmail resolves!
    mockProviderAdapter.sendEmail.mockImplementationOnce(async () => {
      // While dispatch is in-flight at the provider seam, user pauses campaign:
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.PAUSED },
      });
      return {
        providerMessageId: 'post-pause-race-prov-1',
        messageId: '<post-pause-race@fastco.example.com>',
      };
    });

    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).not.toBeNull();
    const result = await dispatchWorker.processJob(claimedJob!);
    // Post-dispatch transaction executed
    expect(result).toBe(true);

    // 1. EmailSend MUST be marked SENT (the email was already delivered by provider!)
    const send = await prisma.emailSend.findFirstOrThrow({
      where: { outreachId: outreachDto.id },
    });
    expect(send.status).toBe(EmailSendStatus.SENT);
    expect(send.providerMessageId).toBe('post-pause-race-prov-1');

    // 2. Outreach MUST become / remain PAUSED
    const outreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(outreach.status).toBe(OutreachStatus.PAUSED);

    // 3. ZERO follow-up check jobs must be scheduled
    const followUpJobsCount = await prisma.job.count({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
      },
    });
    expect(followUpJobsCount).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Section 9: Suppression & Unsuppress Invariants
  // ─────────────────────────────────────────────────────────────────────────────
  it('6. Suppression and unsuppression invariants: unsuppress never automatically sends emails', async () => {
    await seedSenderAccount(currentWorkspaceId);
    const { person, pca } = await seedContact(
      currentWorkspaceId,
      'privacy@enterprise.org',
      'Enterprise Org',
      'Priv',
      'Acy',
    );

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Suppression Policy Campaign',
        status: CampaignStatus.ACTIVE,
        maxFollowUps: 1,
      },
    });

    const recipient = await prisma.campaignRecipient.create({
      data: {
        workspaceId: currentWorkspaceId,
        campaignId: campaign.id,
        personCompanyAssociationId: pca.id,
        status: CampaignRecipientStatus.ACTIVE,
      },
    });

    // 1. Suppress the contact using positional parameters (workspaceId, contactId, userId, reason, notes)
    await suppressContactUseCase.execute(
      currentWorkspaceId,
      pca.id,
      undefined,
      SuppressionReason.UNSUBSCRIBED,
    );

    // Verify suppression record created and recipient updated to SUPPRESSED
    const suppressionRecord = await prisma.suppression.findFirst({
      where: {
        workspaceId: currentWorkspaceId,
        email: person.email,
      },
    });
    expect(suppressionRecord).not.toBeNull();

    const recipientAfterSuppress = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(recipientAfterSuppress.status).toBe(CampaignRecipientStatus.SUPPRESSED);

    // 2. Unsuppress the contact
    await unsuppressContactUseCase.execute(
      currentWorkspaceId,
      pca.id,
    );

    // Verify suppression record removed
    const suppressionAfterUnsuppress = await prisma.suppression.findFirst({
      where: {
        workspaceId: currentWorkspaceId,
        email: person.email,
      },
    });
    expect(suppressionAfterUnsuppress).toBeNull();

    // 3. Invariant check: system must remain strictly quiescent!
    // No automated sends, no email dispatch jobs, no provider calls
    const dispatchJobs = await prisma.job.count({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'EMAIL_DISPATCH',
      },
    });
    expect(dispatchJobs).toBe(0);

    const emailSends = await prisma.emailSend.count({
      where: { workspaceId: currentWorkspaceId },
    });
    expect(emailSends).toBe(0);

    expect(mockProviderAdapter.sendEmail).not.toHaveBeenCalled();
  });
});
