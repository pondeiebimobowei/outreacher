import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
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
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../src/modules/workspaces/workspace.guard';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { CampaignController } from '../../src/modules/campaign/campaign.controller';
import { OutreachesController } from '../../src/modules/outreach/outreaches.controller';
import { TemplateController } from '../../src/modules/template/template.controller';
import { CreateCampaignUseCase } from '../../src/modules/campaign/application/create-campaign.use-case';
import { UpdateCampaignUseCase } from '../../src/modules/campaign/application/update-campaign.use-case';
import { AddCampaignRecipientsUseCase } from '../../src/modules/campaign/application/add-campaign-recipients.use-case';
import { GetCampaignRecipientsUseCase } from '../../src/modules/campaign/application/get-campaign-recipients.use-case';
import { GetCampaignUseCase } from '../../src/modules/campaign/application/get-campaign.use-case';
import { ListCampaignsUseCase } from '../../src/modules/campaign/application/list-campaigns.use-case';
import { ChangeCampaignStatusUseCase } from '../../src/modules/campaign/application/change-campaign-status.use-case';
import { ResumeCampaignRecipientUseCase } from '../../src/modules/campaign/application/resume-campaign-recipient.use-case';
import { SendOutreachUseCase } from '../../src/modules/outreach/application/send-outreach.use-case';
import { ApproveDraftUseCase } from '../../src/modules/outreach/application/approve-draft.use-case';
import { UpdateDraftUseCase } from '../../src/modules/outreach/application/update-draft.use-case';
import { GetOutreachUseCase } from '../../src/modules/outreach/application/get-outreach.use-case';
import { CreateOutreachUseCase } from '../../src/modules/outreach/application/create-outreach.use-case';
import { GenerateDirectOutreachUseCase } from '../../src/modules/outreach/application/generate-direct-outreach.use-case';
import { ResumeOutreachUseCase } from '../../src/modules/outreach/application/resume-outreach.use-case';
import { CreateTemplateUseCase } from '../../src/modules/template/application/create-template.use-case';
import { GetTemplateUseCase } from '../../src/modules/template/application/get-template.use-case';
import { ListTemplatesUseCase } from '../../src/modules/template/application/list-templates.use-case';
import { UpdateTemplateUseCase } from '../../src/modules/template/application/update-template.use-case';
import { DeleteTemplateUseCase } from '../../src/modules/template/application/delete-template.use-case';
import { SetTemplateStepsUseCase } from '../../src/modules/template/application/set-template-steps.use-case';
import { PreviewTemplateUseCase } from '../../src/modules/template/application/preview-template.use-case';
import { CAMPAIGN_REPOSITORY_TOKEN } from '../../src/modules/campaign/domain/campaign.repository.interface';
import { PrismaCampaignRepository } from '../../src/modules/campaign/infrastructure/prisma-campaign.repository';
import { SUPPRESSION_CHECKER_TOKEN } from '../../src/modules/email/domain/suppression-checker.interface';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { SECRET_RESOLVER_TOKEN } from '../../src/modules/email/domain/secret-resolver.interface';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: Campaign End-to-End & Multi-Company Journey (PostgreSQL Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let worker: EmailDispatchWorker;
  let providerRegistry: EmailProviderRegistry;
  let mockProviderAdapter: any;

  let currentWorkspaceId: string;
  let currentUserId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;

    mockProviderAdapter = {
      sendEmail: jest.fn().mockResolvedValue({
        providerMessageId: 'msg-provider-12345',
        messageId: '<msg-12345@test.com>',
      }),
      verifyConnection: jest.fn().mockResolvedValue(true),
    };

    providerRegistry = {
      hasAdapter: jest.fn().mockReturnValue(true),
      getAdapter: jest.fn().mockReturnValue(mockProviderAdapter),
    } as unknown as EmailProviderRegistry;

    const mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'RESEND',
        apiKey: 'resend-test-api-key',
      }),
    };

    worker = new EmailDispatchWorker(
      prismaService,
      providerRegistry,
      mockSecretResolver,
    );

    const templateEngine = new TemplateEngineService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CampaignController, OutreachesController, TemplateController],
      providers: [
        { provide: PrismaService, useValue: prismaService },
        { provide: EmailProviderRegistry, useValue: providerRegistry },
        { provide: SECRET_RESOLVER_TOKEN, useValue: mockSecretResolver },
        { provide: TemplateEngineService, useValue: templateEngine },
        { provide: CAMPAIGN_REPOSITORY_TOKEN, useClass: PrismaCampaignRepository },
        { provide: SUPPRESSION_CHECKER_TOKEN, useClass: PrismaSuppressionChecker },
        SendEligibilityService,
        CreateCampaignUseCase,
        UpdateCampaignUseCase,
        AddCampaignRecipientsUseCase,
        GetCampaignRecipientsUseCase,
        GetCampaignUseCase,
        ListCampaignsUseCase,
        ChangeCampaignStatusUseCase,
        ResumeCampaignRecipientUseCase,
        SendOutreachUseCase,
        ApproveDraftUseCase,
        UpdateDraftUseCase,
        GetOutreachUseCase,
        CreateOutreachUseCase,
        GenerateDirectOutreachUseCase,
        ResumeOutreachUseCase,
        CreateTemplateUseCase,
        GetTemplateUseCase,
        ListTemplatesUseCase,
        UpdateTemplateUseCase,
        DeleteTemplateUseCase,
        SetTemplateStepsUseCase,
        PreviewTemplateUseCase,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: currentUserId, workspaceId: currentWorkspaceId };
          return true;
        },
      })
      .overrideGuard(WorkspaceGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.workspace = { id: currentWorkspaceId, role: 'OWNER' };
          req.workspaceId = currentWorkspaceId;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();

    // Seed base workspace & user
    const ws = await prisma.workspace.create({
      data: { name: 'E2E Journey Workspace' },
    });
    const user = await prisma.user.create({
      data: {
        email: `tester-${randomUUID()}@example.com`,
        firstName: 'Jane',
        lastName: 'Tester',
      },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' },
    });

    currentWorkspaceId = ws.id;
    currentUserId = user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await teardownTestDatabase();
  });

  async function seedSenderAccount(workspaceId: string) {
    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        name: 'Resend Test',
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
        dailyLimit: 100,
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
      },
    });

    const person = await prisma.person.create({
      data: {
        workspaceId,
        email,
        firstName,
        lastName,
        title: 'VP of Engineering',
      },
    });

    const pca = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId,
        personId: person.id,
        companyId: company.id,
        role: 'VP of Engineering',
        workEmail: email,
        conversationState: 'NO_REPLY',
      },
    });

    return { company, person, pca };
  }

  it('1. Executes full end-to-end campaign journey across HTTP controllers through provider boundary to SENT', async () => {
    // 1. Seed sender account
    const sender = await seedSenderAccount(currentWorkspaceId);

    // 2. Seed contact at Acme Corp
    const { pca } = await seedContact(
      currentWorkspaceId,
      'elena@acme.example.com',
      'Acme Corp',
      'Elena',
      'Rostova',
    );

    // 3. Create real Template with 2 steps
    const templateRes = await request(app.getHttpServer())
      .post('/templates')
      .send({
        name: 'Executive Technical Outreach',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Intro: {{contact.firstName}} regarding {{company.name}}',
            bodyTemplate: 'Hi {{contact.firstName}}, admired {{company.name}} architecture. Best regards.',
          },
          {
            sequence: 1,
            subjectTemplate: 'Re: Intro: {{contact.firstName}}',
            bodyTemplate: 'Following up on distributed systems alignment.',
          },
        ],
      })
      .expect(201);

    const templateId = templateRes.body.id;
    expect(templateId).toBeDefined();

    const createCampRes = await request(app.getHttpServer())
      .post('/campaigns')
      .send({
        name: 'Q4 Infrastructure Leadership',
        contentSource: 'TEMPLATE',
        templateId,
        senderAccountIds: [sender.id],
        maxFollowUps: 1,
        followUpDelayBusinessDays: 3,
      });
    if (createCampRes.status !== 201) {
      console.error('CREATE_CAMPAIGN_ERROR:', createCampRes.status, createCampRes.body);
    }
    expect(createCampRes.status).toBe(201);

    const campaignId = createCampRes.body.id;
    expect(createCampRes.body.status).toBe('DRAFT');

    // 5. Activate campaign via HTTP PATCH /campaigns/:id
    await request(app.getHttpServer())
      .patch(`/campaigns/${campaignId}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const activeCamp = await prisma.campaign.findUnique({ where: { id: campaignId } });
    expect(activeCamp?.status).toBe(CampaignStatus.ACTIVE);

    // 6. Bind recipient via HTTP POST /campaigns/:id/recipients
    const addRecipRes = await request(app.getHttpServer())
      .post(`/campaigns/${campaignId}/recipients`)
      .send({
        recipients: [{ personCompanyAssociationId: pca.id }],
      })
      .expect(201);

    expect(addRecipRes.body).toHaveLength(1);
    const recipientId = addRecipRes.body[0].id;
    expect(addRecipRes.body[0].status).toBe('PENDING');

    // Create Outreach for recipient via HTTP POST /outreaches
    const outreachRes = await request(app.getHttpServer())
      .post('/outreaches')
      .set('Idempotency-Key', randomUUID())
      .send({
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipientId,
      });

    if (outreachRes.status !== 201) {
      console.error('CREATE_OUTREACH_FAIL:', outreachRes.status, outreachRes.body);
    }
    expect(outreachRes.status).toBe(201);

    const outreachId = outreachRes.body.id;

    // Verify initial Outreach created in PostgreSQL
    const outreach = await prisma.outreach.findUnique({
      where: { id: outreachId },
    });
    expect(outreach).not.toBeNull();
    expect(outreach!.status).toBe(OutreachStatus.DRAFT);
    expect(outreach!.contentSource).toBe('TEMPLATE');
    expect(outreach!.subject).toBe('Intro: Elena regarding Acme Corp');
    expect(outreach!.message).toContain('Hi Elena, admired Acme Corp architecture');

    // 7. Approve draft via HTTP POST /outreaches/:id/approve
    const approveRes = await request(app.getHttpServer())
      .post(`/outreaches/${outreachId}/approve`)
      .send({})
      .expect(200);

    expect(approveRes.body.status).toBe('APPROVED');

    // Assert PostgreSQL state after approval
    const approvedOutreach = await prisma.outreach.findUnique({ where: { id: outreach!.id } });
    expect(approvedOutreach?.status).toBe(OutreachStatus.APPROVED);

    // 8. Send Outreach via HTTP POST /outreaches/:id/send with Idempotency-Key
    const sendIdempotencyKey = randomUUID();
    const sendRes = await request(app.getHttpServer())
      .post(`/outreaches/${outreach!.id}/send`)
      .set('Idempotency-Key', sendIdempotencyKey)
      .send({})
      .expect(202);

    expect(sendRes.body.jobId).toBeDefined();
    expect(sendRes.body.status).toBe('QUEUED');

    // 9. Assert intermediate reservation state in PostgreSQL
    // CampaignRecipient: PENDING -> ACTIVE
    const recipAfterSend = await prisma.campaignRecipient.findUnique({ where: { id: recipientId } });
    expect(recipAfterSend?.status).toBe(CampaignRecipientStatus.ACTIVE);

    // Outreach: APPROVED -> SENDING
    const outreachAfterSend = await prisma.outreach.findUnique({ where: { id: outreach!.id } });
    expect(outreachAfterSend?.status).toBe(OutreachStatus.SENDING);

    // EmailSend: sequence 0, type INITIAL, status RESERVED
    const emailSend = await prisma.emailSend.findFirst({
      where: { outreachId: outreach!.id },
    });
    expect(emailSend).not.toBeNull();
    expect(emailSend!.sequence).toBe(0);
    expect(emailSend!.type).toBe(EmailSendType.INITIAL);
    expect(emailSend!.status).toBe(EmailSendStatus.RESERVED);

    // Job: EMAIL_DISPATCH, status PENDING
    const job = await prisma.job.findFirst({
      where: { workspaceId: currentWorkspaceId, type: 'EMAIL_DISPATCH' },
    });
    expect(job).not.toBeNull();
    expect(job!.status).toBe(JobStatus.PENDING);

    // 10. Execute provider boundary execution via EmailDispatchWorker
    const claimed = await worker.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed!.job.id).toBe(job!.id);

    const processSuccess = await worker.processJob(claimed!);
    expect(processSuccess).toBe(true);
    expect(mockProviderAdapter.sendEmail).toHaveBeenCalledTimes(1);

    // 11. Assert terminal provider delivery state in PostgreSQL
    // Job: COMPLETED
    const completedJob = await prisma.job.findUnique({ where: { id: job!.id } });
    expect(completedJob?.status).toBe(JobStatus.COMPLETED);

    // EmailSend: RESERVED -> SENDING -> SENT
    const completedSend = await prisma.emailSend.findUnique({ where: { id: emailSend!.id } });
    expect(completedSend?.status).toBe(EmailSendStatus.SENT);
    expect(completedSend?.sentAt).not.toBeNull();
    expect(completedSend?.providerMessageId).toBe('msg-provider-12345');

    // Outreach: SENDING -> ACTIVE (awaiting replies / follow-ups)
    const activeOutreach = await prisma.outreach.findUnique({ where: { id: outreach!.id } });
    expect(activeOutreach?.status).toBe(OutreachStatus.ACTIVE);
  });

  it('2. Enforces campaign-wide multi-company isolation and pause/resume semantics without corrupting completed sends', async () => {
    const sender = await seedSenderAccount(currentWorkspaceId);

    // Create 3 contacts across 3 different companies
    const c1 = await seedContact(currentWorkspaceId, 'alice@alpha.example.com', 'Alpha Systems', 'Alice', 'Smith');
    const c2 = await seedContact(currentWorkspaceId, 'bob@beta.example.com', 'Beta Cloud', 'Bob', 'Jones');
    const c3 = await seedContact(currentWorkspaceId, 'carol@gamma.example.com', 'Gamma Logic', 'Carol', 'Danvers');

    // Create template
    const template = await prisma.emailTemplate.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Multi-Company Template',
        steps: {
          create: [
            {
              sequence: 0,
              subjectTemplate: 'Note for {{contact.firstName}}',
              bodyTemplate: 'Hello {{contact.firstName}} at {{company.name}}.',
            },
          ],
        },
      },
    });

    // Create ACTIVE campaign
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Multi-Tenant Multi-Company Campaign',
        status: CampaignStatus.ACTIVE,
        contentSource: 'TEMPLATE',
        templateId: template.id,
        maxFollowUps: 0,
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

    // Add all 3 recipients via AddCampaignRecipientsUseCase
    const addRecipientsUseCase = app.get(AddCampaignRecipientsUseCase);
    const addedRecipients = await addRecipientsUseCase.execute(
      currentWorkspaceId,
      campaign.id,
      {
        recipients: [
          { personCompanyAssociationId: c1.pca.id },
          { personCompanyAssociationId: c2.pca.id },
          { personCompanyAssociationId: c3.pca.id },
        ],
      },
    );

    expect(addedRecipients).toHaveLength(3);
    const r1 = addedRecipients.find((r) => r.personCompanyAssociationId === c1.pca.id)!;
    const r2 = addedRecipients.find((r) => r.personCompanyAssociationId === c2.pca.id)!;
    const r3 = addedRecipients.find((r) => r.personCompanyAssociationId === c3.pca.id)!;

    const createOutreachUseCase = app.get(CreateOutreachUseCase);
    const o1Dto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      { personCompanyAssociationId: c1.pca.id, campaignRecipientId: r1.id },
      randomUUID(),
    );
    const o2Dto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      { personCompanyAssociationId: c2.pca.id, campaignRecipientId: r2.id },
      randomUUID(),
    );
    const o3Dto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      { personCompanyAssociationId: c3.pca.id, campaignRecipientId: r3.id },
      randomUUID(),
    );

    // Recipient 1: Progress all the way to SENT
    const o1 = await prisma.outreach.findFirstOrThrow({ where: { id: o1Dto.id } });
    await app.get(ApproveDraftUseCase).execute({ workspaceId: currentWorkspaceId, outreachId: o1.id });
    await app.get(SendOutreachUseCase).execute({
      workspaceId: currentWorkspaceId,
      outreachId: o1.id,
      idempotencyKey: randomUUID(),
    });
    const job1 = await worker.claimNextJob();
    await worker.processJob(job1!);

    const send1 = await prisma.emailSend.findFirstOrThrow({ where: { outreachId: o1.id } });
    expect(send1.status).toBe(EmailSendStatus.SENT);

    // Recipient 2: Remains in DRAFT stage
    const o2 = await prisma.outreach.findFirstOrThrow({ where: { id: o2Dto.id } });
    expect(o2.status).toBe(OutreachStatus.DRAFT);

    // Recipient 3: Approved and send reserved (Job PENDING)
    const o3 = await prisma.outreach.findFirstOrThrow({ where: { id: o3Dto.id } });
    await app.get(ApproveDraftUseCase).execute({ workspaceId: currentWorkspaceId, outreachId: o3.id });
    await app.get(SendOutreachUseCase).execute({
      workspaceId: currentWorkspaceId,
      outreachId: o3.id,
      idempotencyKey: randomUUID(),
    });

    // Now pause the Campaign: ACTIVE -> PAUSED
    await app.get(ChangeCampaignStatusUseCase).pause(currentWorkspaceId, campaign.id);

    // Assert: Recipient 1's completed send is strictly protected
    const send1AfterPause = await prisma.emailSend.findUnique({ where: { id: send1.id } });
    expect(send1AfterPause?.status).toBe(EmailSendStatus.SENT);

    // Assert: Recipient 2 remains DRAFT
    const o2AfterPause = await prisma.outreach.findUnique({ where: { id: o2.id } });
    expect(o2AfterPause?.status).toBe(OutreachStatus.DRAFT);

    // Assert: Recipient 3's pre-dispatch worker run detects campaign pause and cancels safely
    const claimedJob3 = await worker.claimNextJob();
    expect(claimedJob3).not.toBeNull();
    const processResult3 = await worker.processJob(claimedJob3!);
    expect(processResult3).toBe(false);

    const send3AfterPause = await prisma.emailSend.findFirst({ where: { outreachId: o3.id } });
    expect(send3AfterPause?.status).toBe('CANCELLED');

    const o3AfterPause = await prisma.outreach.findUnique({ where: { id: o3.id } });
    expect(o3AfterPause?.status).toBe(OutreachStatus.PAUSED);

    // Resume campaign: PAUSED -> ACTIVE
    await app.get(ChangeCampaignStatusUseCase).resume(currentWorkspaceId, campaign.id);

    const resumedCamp = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    expect(resumedCamp?.status).toBe(CampaignStatus.ACTIVE);
  });
});
