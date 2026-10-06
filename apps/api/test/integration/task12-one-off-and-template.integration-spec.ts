import {
  PrismaClient,
  CampaignStatus,
  OutreachStatus,
  EmailSendStatus,
  EmailSendType,
  JobStatus,
  IntegrationProvider,
  IntegrationStatus,
  SenderStatus,
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
import { CreateTemplateUseCase } from '../../src/modules/template/application/create-template.use-case';
import { SetTemplateStepsUseCase } from '../../src/modules/template/application/set-template-steps.use-case';
import { DeleteTemplateUseCase } from '../../src/modules/template/application/delete-template.use-case';
import { CreateCampaignUseCase } from '../../src/modules/campaign/application/create-campaign.use-case';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import {
  AppConflictException,
  AppValidationException,
} from '../../src/common/errors/application.exception';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: One-Off Outreach & Template Consumption Invariants (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let templateEngine: TemplateEngineService;
  let createOutreachUseCase: CreateOutreachUseCase;
  let approveDraftUseCase: ApproveDraftUseCase;
  let sendOutreachUseCase: SendOutreachUseCase;
  let createTemplateUseCase: CreateTemplateUseCase;
  let setTemplateStepsUseCase: SetTemplateStepsUseCase;
  let deleteTemplateUseCase: DeleteTemplateUseCase;
  let createCampaignUseCase: CreateCampaignUseCase;
  let worker: EmailDispatchWorker;
  let mockProviderAdapter: any;

  let currentWorkspaceId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    templateEngine = new TemplateEngineService();

    mockProviderAdapter = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'one-off-provider-id-999',
        messageId: '<oneoff-msg-999@test.com>',
      }),
      verifyConnection: jest.fn().mockResolvedValue(true),
    };

    const providerRegistry = {
      hasAdapter: jest.fn().mockReturnValue(true),
      getAdapter: jest.fn().mockReturnValue(mockProviderAdapter),
    } as unknown as EmailProviderRegistry;

    const mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'RESEND',
        apiKey: 'resend-oneoff-key',
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
    createTemplateUseCase = new CreateTemplateUseCase(prismaService, templateEngine);
    setTemplateStepsUseCase = new SetTemplateStepsUseCase(prismaService, templateEngine);
    deleteTemplateUseCase = new DeleteTemplateUseCase(prismaService);
    createCampaignUseCase = new CreateCampaignUseCase(prismaService, templateEngine);

    worker = new EmailDispatchWorker(
      prismaService,
      providerRegistry,
      mockSecretResolver,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();

    const ws = await prisma.workspace.create({
      data: { name: 'One-Off & Template Workspace' },
    });
    currentWorkspaceId = ws.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedSenderAccount(workspaceId: string, fromName = 'Sender Alex') {
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
        fromName,
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
        role: 'Chief Technology Officer',
        workEmail: email,
        conversationState: 'NO_REPLY',
      },
    });

    return { company, person, pca };
  }

  describe('Section 3: One-off Outreach Journey', () => {
    it('executes one-off outreach (campaignRecipientId = null) through send reservation and provider dispatch', async () => {
      const sender = await seedSenderAccount(currentWorkspaceId);
      const { pca } = await seedContact(
        currentWorkspaceId,
        'marcus@cloudops.example.com',
        'CloudOps Inc',
        'Marcus',
        'Vance',
      );

      // 1. Create One-off Outreach: MANUAL source, no campaignRecipientId
      const outreachDto = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          campaignRecipientId: null,
          senderAccountId: sender.id,
          contentSource: 'MANUAL',
          subject: 'Direct Executive Outreach to Marcus',
          message: 'Hello Marcus, checking in directly regarding CloudOps.',
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      expect(outreachDto.campaignRecipientId).toBeNull();
      expect(outreachDto.status).toBe('DRAFT');
      expect(outreachDto.personCompanyAssociationId).toBe(pca.id);

      // Verify no CampaignRecipient record was created
      const recipCount = await prisma.campaignRecipient.count({
        where: { workspaceId: currentWorkspaceId },
      });
      expect(recipCount).toBe(0);

      // 2. Approve draft
      const approvedDto = await approveDraftUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
      });
      expect(approvedDto.status).toBe('APPROVED');

      // 3. Send Outreach via SendOutreachUseCase
      const sendRes = await sendOutreachUseCase.execute({
        workspaceId: currentWorkspaceId,
        outreachId: outreachDto.id,
        idempotencyKey: randomUUID(),
      });
      expect(sendRes.status).toBe('QUEUED');

      // 4. Verify reservation in PostgreSQL: EmailSend created at sequence 0, INITIAL, RESERVED
      const emailSend = await prisma.emailSend.findFirstOrThrow({
        where: { outreachId: outreachDto.id },
      });
      expect(emailSend.sequence).toBe(0);
      expect(emailSend.type).toBe(EmailSendType.INITIAL);
      expect(emailSend.status).toBe(EmailSendStatus.RESERVED);
      expect(emailSend.senderAccountId).toBe(sender.id);

      // Verify Outreach is SENDING
      const sendingOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreachDto.id },
      });
      expect(sendingOutreach.status).toBe(OutreachStatus.SENDING);

      // 5. Worker processes job through provider boundary
      const claimedJob = await worker.claimNextJob();
      expect(claimedJob).not.toBeNull();
      const processSuccess = await worker.processJob(claimedJob!);
      expect(processSuccess).toBe(true);

      // 6. Assert terminal state in PostgreSQL
      const completedSend = await prisma.emailSend.findUniqueOrThrow({
        where: { id: emailSend.id },
      });
      expect(completedSend.status).toBe(EmailSendStatus.SENT);
      expect(completedSend.providerMessageId).toBe('one-off-provider-id-999');

      // Outreach transitions to ACTIVE awaiting response/outcome
      const terminalOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreachDto.id },
      });
      expect(terminalOutreach.status).toBe(OutreachStatus.ACTIVE);

      // Verify PCA state transitioned to ACTIVE
      const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(updatedPca.conversationState).toBe('ACTIVE');
    });

    it('allows multiple distinct one-off outreaches on the same PCA (unlike unique campaignRecipient)', async () => {
      const sender = await seedSenderAccount(currentWorkspaceId);
      const { pca } = await seedContact(
        currentWorkspaceId,
        'sarah@fintech.example.com',
        'FinTech Global',
        'Sarah',
        'Connor',
      );

      // Create first one-off outreach
      const o1 = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          campaignRecipientId: null,
          senderAccountId: sender.id,
          contentSource: 'MANUAL',
          subject: 'First Topic',
          message: 'Discussing Topic A',
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      // Create second one-off outreach on the same PCA
      const o2 = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          campaignRecipientId: null,
          senderAccountId: sender.id,
          contentSource: 'MANUAL',
          subject: 'Second Topic',
          message: 'Discussing Topic B',
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      expect(o1.id).not.toBe(o2.id);
      expect(o1.personCompanyAssociationId).toBe(pca.id);
      expect(o2.personCompanyAssociationId).toBe(pca.id);

      const dbOutreaches = await prisma.outreach.findMany({
        where: { personCompanyAssociationId: pca.id },
      });
      expect(dbOutreaches).toHaveLength(2);
    });
  });

  describe('Section 4: Template Consumption & Invariant Enforcement', () => {
    it('enforces {{sender.name}} restriction: forbids in Campaign, allows in One-Off with explicit sender', async () => {
      const sender = await seedSenderAccount(currentWorkspaceId, 'Dr. Samantha Carter');
      const { pca } = await seedContact(
        currentWorkspaceId,
        'daniel@sg1.example.com',
        'Stargate Command',
        'Daniel',
        'Jackson',
      );

      // 1. Create template containing {{sender.name}}
      const templateWithSender = await createTemplateUseCase.execute(currentWorkspaceId, {
        name: 'Sender Personalized Template',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Message from {{sender.name}} for {{contact.firstName}}',
            bodyTemplate: 'Hi {{contact.firstName}}, this is {{sender.name}} reaching out.',
          },
        ],
      });

      // 2. Attempt to create a Campaign with this template -> must fail with AppValidationException
      await expect(
        createCampaignUseCase.execute(currentWorkspaceId, {
          name: 'Invalid Campaign With Sender Template',
          contentSource: 'TEMPLATE',
          templateId: templateWithSender.id,
          senderAccountIds: [sender.id],
          maxFollowUps: 0,
        }),
      ).rejects.toThrow(AppValidationException);

      // 3. Create One-off Outreach with this template and explicit senderAccountId -> MUST SUCCEED
      const oneOffOutreach = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          campaignRecipientId: null,
          senderAccountId: sender.id,
          contentSource: 'TEMPLATE',
          templateId: templateWithSender.id,
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      expect(oneOffOutreach.subject).toBe('Message from Dr. Samantha Carter for Daniel');
      expect(oneOffOutreach.message).toBe('Hi Daniel, this is Dr. Samantha Carter reaching out.');
    });

    it('snapshots template step into outreach draft and remains invariant against subsequent template edits', async () => {
      const sender = await seedSenderAccount(currentWorkspaceId);
      const { pca } = await seedContact(
        currentWorkspaceId,
        'jack@airforce.example.com',
        'Homeworld Command',
        'Jack',
        'ONeill',
      );

      // 1. Create initial template
      const template = await createTemplateUseCase.execute(currentWorkspaceId, {
        name: 'Mutable Snapshot Template',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Original Subject: {{contact.firstName}}',
            bodyTemplate: 'Original Body for {{company.name}}.',
          },
        ],
      });

      // 2. Create One-off Outreach referencing template
      const outreach = await createOutreachUseCase.execute(
        currentWorkspaceId,
        {
          personCompanyAssociationId: pca.id,
          campaignRecipientId: null,
          senderAccountId: sender.id,
          contentSource: 'TEMPLATE',
          templateId: template.id,
          maxFollowUps: 0,
        },
        randomUUID(),
      );

      expect(outreach.subject).toBe('Original Subject: Jack');
      expect(outreach.message).toBe('Original Body for Homeworld Command.');

      // 3. Mutate template steps
      await setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'V2 Completely Changed Subject: {{contact.firstName}}',
            bodyTemplate: 'V2 Changed Body.',
          },
        ],
      });

      // 4. Assert already created Outreach retains its snapshot unchanged
      const persistedOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreach.id },
      });
      expect(persistedOutreach.subject).toBe('Original Subject: Jack');
      expect(persistedOutreach.message).toBe('Original Body for Homeworld Command.');
    });

    it('enforces structural mutation protection: forbids deleting or removing required steps while referenced', async () => {
      const sender = await seedSenderAccount(currentWorkspaceId);

      // 1. Create template with 2 steps (sequence 0 and 1)
      const template = await createTemplateUseCase.execute(currentWorkspaceId, {
        name: 'Protected Multi-Step Template',
        steps: [
          { sequence: 0, subjectTemplate: 'Step 0', bodyTemplate: 'Body 0' },
          { sequence: 1, subjectTemplate: 'Step 1', bodyTemplate: 'Body 1' },
        ],
      });

      // 2. Create ACTIVE Campaign requiring maxFollowUps: 1 (requires steps 0..1)
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: currentWorkspaceId,
          name: 'Active Structural Guard Campaign',
          status: CampaignStatus.ACTIVE,
          contentSource: 'TEMPLATE',
          templateId: template.id,
          maxFollowUps: 1,
        },
      });

      // 3. Attempt to delete template -> AppConflictException (409)
      await expect(
        deleteTemplateUseCase.execute(currentWorkspaceId, template.id),
      ).rejects.toThrow(AppConflictException);

      // 4. Attempt to mutate steps to remove step 1 (providing only step 0) -> AppConflictException (409)
      await expect(
        setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
          steps: [
            { sequence: 0, subjectTemplate: 'Only Step 0', bodyTemplate: 'Only Body 0' },
          ],
        }),
      ).rejects.toThrow(AppConflictException);

      // 5. Updating steps while preserving required sequences 0 and 1 SUCCEEDS
      const updated = await setTemplateStepsUseCase.execute(currentWorkspaceId, template.id, {
        steps: [
          { sequence: 0, subjectTemplate: 'Updated Step 0', bodyTemplate: 'Updated Body 0' },
          { sequence: 1, subjectTemplate: 'Updated Step 1', bodyTemplate: 'Updated Body 1' },
        ],
      });
      expect(updated.steps).toHaveLength(2);
    });
  });
});
