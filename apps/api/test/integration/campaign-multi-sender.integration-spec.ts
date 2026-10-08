import {
  PrismaClient,
  JobStatus,
  EmailSendStatus,
  ConversationState,
  CampaignStatus,
  CampaignRecipientStatus,
  OutreachStatus,
  EmailSendType,
  IntegrationProvider,
  IntegrationStatus,
  SenderStatus,
  AssignmentStatus,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { SendOutreachUseCase } from '../../src/modules/outreach/application/send-outreach.use-case';
import { AssignCampaignSendersUseCase } from '../../src/modules/campaign-sender/application/assign-campaign-senders.use-case';
import { CreateCampaignUseCase } from '../../src/modules/campaign/application/create-campaign.use-case';
import { UpdateCampaignUseCase } from '../../src/modules/campaign/application/update-campaign.use-case';
import { ChangeCampaignStatusUseCase } from '../../src/modules/campaign/application/change-campaign-status.use-case';
import { PrismaCampaignRepository } from '../../src/modules/campaign/infrastructure/prisma-campaign.repository';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';
import { AppConflictException, AppValidationException } from '../../src/common/errors/application.exception';
import { randomUUID } from 'crypto';

describe('BL-013: Campaign Multi-Sender Orchestration & Dispatch (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let eligibilityService: SendEligibilityService;
  let sendOutreachUseCase: SendOutreachUseCase;
  let assignSendersUseCase: AssignCampaignSendersUseCase;
  let createCampaignUseCase: CreateCampaignUseCase;
  let updateCampaignUseCase: UpdateCampaignUseCase;
  let changeStatusUseCase: ChangeCampaignStatusUseCase;
  let providerRegistry: EmailProviderRegistry;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;

    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    providerRegistry = {
      hasAdapter: jest.fn((provider: string) => provider === 'RESEND' || provider === 'MOCK'),
      getAdapter: jest.fn(),
    } as unknown as EmailProviderRegistry;

    eligibilityService = new SendEligibilityService(suppressionChecker, providerRegistry);
    sendOutreachUseCase = new SendOutreachUseCase(prismaService, eligibilityService);
    assignSendersUseCase = new AssignCampaignSendersUseCase(prismaService, providerRegistry);

    const templateEngine = new TemplateEngineService();
    createCampaignUseCase = new CreateCampaignUseCase(prismaService, templateEngine, providerRegistry);
    updateCampaignUseCase = new UpdateCampaignUseCase(prismaService, templateEngine, providerRegistry);

    const campaignRepo = new PrismaCampaignRepository(prismaService);
    changeStatusUseCase = new ChangeCampaignStatusUseCase(campaignRepo, providerRegistry);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedWorkspace(name = 'MultiSender WS') {
    const ws = await prisma.workspace.create({ data: { name } });
    const user = await prisma.user.create({
      data: { email: `admin-${randomUUID()}@test.com`, firstName: 'Admin', lastName: 'User' },
    });
    return { ws, user };
  }

  async function seedSender(
    workspaceId: string,
    opts: {
      fromEmail: string;
      dailyLimit?: number;
      senderStatus?: SenderStatus;
      integrationStatus?: IntegrationStatus;
      provider?: IntegrationProvider;
    },
  ) {
    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        name: `Integration-${randomUUID().slice(0, 8)}`,
        provider: opts.provider ?? IntegrationProvider.RESEND,
        status: opts.integrationStatus ?? IntegrationStatus.ACTIVE,
        secretReference: `sec-${randomUUID()}`,
      },
    });

    const sender = await prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId: integration.id,
        fromEmail: opts.fromEmail.toLowerCase(),
        fromName: 'Sender ' + opts.fromEmail,
        status: opts.senderStatus ?? SenderStatus.ACTIVE,
        dailyLimit: opts.dailyLimit ?? 10,
      },
    });

    return { integration, sender };
  }

  async function seedCampaignWithSenders(
    workspaceId: string,
    senderIds: string[],
    status: CampaignStatus = CampaignStatus.ACTIVE,
  ) {
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        name: `Campaign-${randomUUID().slice(0, 8)}`,
        status,
        contentSource: 'AI',
        maxFollowUps: 2,
      },
    });

    for (const sId of senderIds) {
      await prisma.campaignSenderAccount.create({
        data: {
          workspaceId,
          campaignId: campaign.id,
          senderAccountId: sId,
          status: AssignmentStatus.ACTIVE,
        },
      });
    }

    return campaign;
  }

  async function seedRecipientAndOutreach(workspaceId: string, campaignId?: string | null) {
    const email = `lead-${randomUUID().slice(0, 8)}@example.com`;
    const company = await prisma.company.create({
      data: {
        workspaceId,
        name: `Company-${randomUUID().slice(0, 6)}`,
        normalizedName: `company-${randomUUID().slice(0, 6)}`,
      },
    });
    const person = await prisma.person.create({
      data: {
        workspaceId,
        email,
        firstName: 'Lead',
        lastName: 'Person',
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

    let recipient: any = null;
    if (campaignId && campaignId !== 'dummy' && campaignId !== 'camp-dummy') {
      recipient = await prisma.campaignRecipient.create({
        data: {
          workspaceId,
          campaignId,
          personCompanyAssociationId: pca.id,
          status: CampaignRecipientStatus.PENDING,
        },
      });
    }

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId,
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipient?.id ?? null,
        senderAccountId: null,
        status: OutreachStatus.APPROVED,
        subject: 'Initial Pitch',
        message: 'Hello there',
        contentSource: 'AI',
      },
    });

    return { company, person, pca, recipient, outreach };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SENDER SELECTION & LEAST-CONSUMED DETERMINISM
  // ───────────────────────────────────────────────────────────────────────────
  describe('Sender selection & least-consumed determinism', () => {
    it('1, 2, 3 senders: distributes reservations according to least-consumed and lexicographical ID tie-break', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 's1@test.com', dailyLimit: 10 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 's2@test.com', dailyLimit: 10 })).sender;
      const s3 = (await seedSender(ws.id, { fromEmail: 's3@test.com', dailyLimit: 10 })).sender;

      // Ensure stable sorted IDs
      const sortedSenders = [s1, s2, s3].sort((a, b) => a.id.localeCompare(b.id));
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id, s3.id]);

      // Round 1: All consumed count = 0 -> must select sortedSenders[0]
      const { outreach: o1 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: o1.id,
        idempotencyKey: 'idem-1',
      });

      const send1 = await prisma.emailSend.findFirst({ where: { outreachId: o1.id } });
      expect(send1?.senderAccountId).toBe(sortedSenders[0].id);

      // Round 2: sortedSenders[0] consumed = 1, [1] and [2] consumed = 0 -> must select sortedSenders[1]
      const { outreach: o2 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: o2.id,
        idempotencyKey: 'idem-2',
      });
      const send2 = await prisma.emailSend.findFirst({ where: { outreachId: o2.id } });
      expect(send2?.senderAccountId).toBe(sortedSenders[1].id);

      // Round 3: sortedSenders[2] has consumed = 0 -> must select sortedSenders[2]
      const { outreach: o3 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: o3.id,
        idempotencyKey: 'idem-3',
      });
      const send3 = await prisma.emailSend.findFirst({ where: { outreachId: o3.id } });
      expect(send3?.senderAccountId).toBe(sortedSenders[2].id);

      // Round 4: All have consumed = 1 -> tie-break picks sortedSenders[0] again
      const { outreach: o4 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: o4.id,
        idempotencyKey: 'idem-4',
      });
      const send4 = await prisma.emailSend.findFirst({ where: { outreachId: o4.id } });
      expect(send4?.senderAccountId).toBe(sortedSenders[0].id);
    });

    it('campaign-linked outreach ignores historical outreach.senderAccountId and uses pool', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 's1@test.com', dailyLimit: 10 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 's2@test.com', dailyLimit: 10 })).sender;

      // Suppose s1 has 5 consumed sends
      for (let i = 0; i < 5; i++) {
        const dummyO = await prisma.outreach.create({
          data: {
            workspaceId: ws.id,
            personCompanyAssociationId: (await seedRecipientAndOutreach(ws.id, 'camp-dummy')).pca.id,
            status: OutreachStatus.DRAFT,
          },
        });
        await prisma.emailSend.create({
          data: {
            workspaceId: ws.id,
            outreachId: dummyO.id,
            senderAccountId: s1.id,
            sequence: 0,
            subject: 'Sub',
            body: 'Body',
            status: EmailSendStatus.SENT,
          },
        });
      }

      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id]);
      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Set outreach.senderAccountId = s1 (even though s1 is heavily consumed and s2 has 0)
      await prisma.outreach.update({
        where: { id: outreach.id },
        data: { senderAccountId: s1.id },
      });

      // Execute send: campaign pool must select s2 (consumed 0 < consumed 5), ignoring outreach.senderAccountId
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: outreach.id,
        idempotencyKey: 'idem-campaign-override',
      });

      const createdSend = await prisma.emailSend.findFirst({ where: { outreachId: outreach.id } });
      expect(createdSend?.senderAccountId).toBe(s2.id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CAPACITY & DAILY LIMIT EXHAUSTION
  // ───────────────────────────────────────────────────────────────────────────
  describe('Capacity and daily limit exhaustion', () => {
    it('single sender below limit succeeds; at limit throws SENDER_CAPACITY_EXCEEDED', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'cap@test.com', dailyLimit: 2 });
      const campaign = await seedCampaignWithSenders(ws.id, [sender.id]);

      const { outreach: o1 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      const { outreach: o2 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      const { outreach: o3 } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Send 1 -> OK
      await sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o1.id, idempotencyKey: 'id-1' });
      // Send 2 -> OK
      await sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o2.id, idempotencyKey: 'id-2' });

      // Send 3 -> Exceeded daily limit 2
      await expect(
        sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o3.id, idempotencyKey: 'id-3' }),
      ).rejects.toThrow('SENDER_CAPACITY_EXCEEDED');
    });

    it('one sender exhausted -> gracefully falls back to available sender; all exhausted -> SENDER_CAPACITY_EXCEEDED', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 's1@test.com', dailyLimit: 1 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 's2@test.com', dailyLimit: 2 })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id]);

      const { outreach: o1 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      const { outreach: o2 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      const { outreach: o3 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      const { outreach: o4 } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Send 1 -> consumes s1 or s2
      await sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o1.id, idempotencyKey: 's-1' });
      // Send 2 -> consumes the other
      await sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o2.id, idempotencyKey: 's-2' });

      // At this point s1 (limit 1) is exhausted, s2 (limit 2) has 1 remaining
      await sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o3.id, idempotencyKey: 's-3' });
      const send3 = await prisma.emailSend.findFirst({ where: { outreachId: o3.id } });
      expect(send3?.senderAccountId).toBe(s2.id);

      // Send 4 -> both exhausted
      await expect(
        sendOutreachUseCase.execute({ workspaceId: ws.id, outreachId: o4.id, idempotencyKey: 's-4' }),
      ).rejects.toThrow('SENDER_CAPACITY_EXCEEDED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CONCURRENT RESERVATION RACE (ROW LOCKING)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Concurrency & FOR UPDATE OF sa row locking', () => {
    it('concurrent reservations never breach individual sender dailyLimit', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 'conc1@test.com', dailyLimit: 3 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 'conc2@test.com', dailyLimit: 3 })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id]);

      // Total capacity is 3 + 3 = 6. Attempt 10 concurrent sends
      const outreaches = [];
      for (let i = 0; i < 10; i++) {
        const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);
        outreaches.push(outreach);
      }

      const results = await Promise.allSettled(
        outreaches.map((o, idx) =>
          sendOutreachUseCase.execute({
            workspaceId: ws.id,
            outreachId: o.id,
            idempotencyKey: `conc-idem-${idx}`,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(6);
      expect(rejected.length).toBe(4);

      // Verify DB counts for each sender
      const s1Count = await prisma.emailSend.count({
        where: { senderAccountId: s1.id, status: 'RESERVED' },
      });
      const s2Count = await prisma.emailSend.count({
        where: { senderAccountId: s2.id, status: 'RESERVED' },
      });

      expect(s1Count).toBe(3);
      expect(s2Count).toBe(3);
    });

    it('same sender contention: concurrent sends against 1 sender serialize safely and reject when exhausted', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 'single-conc@test.com', dailyLimit: 2 })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id]);

      const outreaches = [];
      for (let i = 0; i < 5; i++) {
        const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);
        outreaches.push(outreach);
      }

      const results = await Promise.allSettled(
        outreaches.map((o, idx) =>
          sendOutreachUseCase.execute({
            workspaceId: ws.id,
            outreachId: o.id,
            idempotencyKey: `single-conc-${idx}`,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(2);
      expect(rejected.length).toBe(3);
      rejected.forEach((rej) => {
        expect((rej as PromiseRejectedResult).reason.message).toContain('SENDER_CAPACITY_EXCEEDED');
      });
    });

    it('multiple sender contention: 3 senders under concurrent load balance without limit breach', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 'm1@test.com', dailyLimit: 2 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 'm2@test.com', dailyLimit: 2 })).sender;
      const s3 = (await seedSender(ws.id, { fromEmail: 'm3@test.com', dailyLimit: 2 })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id, s3.id]);

      const outreaches = [];
      for (let i = 0; i < 9; i++) {
        const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);
        outreaches.push(outreach);
      }

      const results = await Promise.allSettled(
        outreaches.map((o, idx) =>
          sendOutreachUseCase.execute({
            workspaceId: ws.id,
            outreachId: o.id,
            idempotencyKey: `multi-conc-${idx}`,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(6);
      expect(rejected.length).toBe(3);

      const counts = await Promise.all([
        prisma.emailSend.count({ where: { senderAccountId: s1.id, status: 'RESERVED' } }),
        prisma.emailSend.count({ where: { senderAccountId: s2.id, status: 'RESERVED' } }),
        prisma.emailSend.count({ where: { senderAccountId: s3.id, status: 'RESERVED' } }),
      ]);
      expect(counts).toEqual([2, 2, 2]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SENDER & INTEGRATION LIFECYCLE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Sender and integration operational lifecycle', () => {
    it('sender PAUSED, DISABLED or integration INVALID_CREDENTIALS / DISABLED prevents selection', async () => {
      const { ws } = await seedWorkspace();
      const { sender: activeSender } = await seedSender(ws.id, { fromEmail: 'active@test.com' });
      const { sender: pausedSender } = await seedSender(ws.id, { fromEmail: 'paused@test.com', senderStatus: SenderStatus.PAUSED });
      const { sender: disabledSender } = await seedSender(ws.id, { fromEmail: 'disabled@test.com', senderStatus: SenderStatus.DISABLED });
      const { sender: invalidIntegSender } = await seedSender(ws.id, {
        fromEmail: 'inv@test.com',
        integrationStatus: IntegrationStatus.INVALID_CREDENTIALS,
      });

      const campaign = await seedCampaignWithSenders(ws.id, [
        activeSender.id,
        pausedSender.id,
        disabledSender.id,
        invalidIntegSender.id,
      ]);

      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: outreach.id,
        idempotencyKey: 'idem-lifecycle',
      });

      const send = await prisma.emailSend.findFirst({ where: { outreachId: outreach.id } });
      expect(send?.senderAccountId).toBe(activeSender.id);
    });

    it('campaign with only ineligible senders throws NEEDS_SENDER on dispatch', async () => {
      const { ws } = await seedWorkspace();
      const { sender: pausedSender } = await seedSender(ws.id, { fromEmail: 'p@test.com', senderStatus: SenderStatus.PAUSED });
      const campaign = await seedCampaignWithSenders(ws.id, [pausedSender.id], CampaignStatus.PAUSED);

      // Mark campaign ACTIVE directly in db to simulate sender pausing after campaign was active
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.ACTIVE } });

      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      await expect(
        sendOutreachUseCase.execute({
          workspaceId: ws.id,
          outreachId: outreach.id,
          idempotencyKey: 'idem-no-sender',
        }),
      ).rejects.toThrow('NEEDS_SENDER');
    });

    it('campaign with unsupported provider throws PROVIDER_UNSUPPORTED', async () => {
      const { ws } = await seedWorkspace();
      const { sender: unsuppSender } = await seedSender(ws.id, {
        fromEmail: 'unsupp@test.com',
        provider: IntegrationProvider.SMTP, // Registry mock only supports RESEND and MOCK
      });
      const campaign = await seedCampaignWithSenders(ws.id, [unsuppSender.id], CampaignStatus.ACTIVE);
      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      await expect(
        sendOutreachUseCase.execute({
          workspaceId: ws.id,
          outreachId: outreach.id,
          idempotencyKey: 'idem-unsupp',
        }),
      ).rejects.toThrow('PROVIDER_UNSUPPORTED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. CAMPAIGN ACTIVATION & RESUME GATES
  // ───────────────────────────────────────────────────────────────────────────
  describe('Campaign activation and resume operational gates', () => {
    it('create campaign as ACTIVE with 0 eligible senders throws CAMPAIGN_NO_ELIGIBLE_SENDERS', async () => {
      const { ws } = await seedWorkspace();
      await expect(
        createCampaignUseCase.execute(ws.id, {
          name: 'Direct Active',
          contentSource: 'AI',
          status: 'ACTIVE',
          senderAccountIds: [],
        }),
      ).rejects.toThrow('CAMPAIGN_NO_ELIGIBLE_SENDERS');
    });

    it('resume PAUSED campaign with 0 eligible senders throws CAMPAIGN_NO_ELIGIBLE_SENDERS', async () => {
      const { ws } = await seedWorkspace();
      const { sender: pausedSender } = await seedSender(ws.id, { fromEmail: 'p@test.com', senderStatus: SenderStatus.PAUSED });
      const campaign = await seedCampaignWithSenders(ws.id, [pausedSender.id], CampaignStatus.PAUSED);

      await expect(
        changeStatusUseCase.resume(ws.id, campaign.id),
      ).rejects.toThrow('CAMPAIGN_NO_ELIGIBLE_SENDERS');
    });

    it('update DRAFT campaign -> ACTIVE with 0 eligible senders throws CAMPAIGN_NO_ELIGIBLE_SENDERS', async () => {
      const { ws } = await seedWorkspace();
      const campaign = await seedCampaignWithSenders(ws.id, [], CampaignStatus.DRAFT);

      await expect(
        updateCampaignUseCase.execute(ws.id, campaign.id, {
          status: 'ACTIVE',
        }),
      ).rejects.toThrow('CAMPAIGN_NO_ELIGIBLE_SENDERS');
    });

    it('update PAUSED campaign -> ACTIVE with 0 eligible senders throws CAMPAIGN_NO_ELIGIBLE_SENDERS', async () => {
      const { ws } = await seedWorkspace();
      const { sender: pausedSender } = await seedSender(ws.id, { fromEmail: 'p@test.com', senderStatus: SenderStatus.PAUSED });
      const campaign = await seedCampaignWithSenders(ws.id, [pausedSender.id], CampaignStatus.PAUSED);

      await expect(
        updateCampaignUseCase.execute(ws.id, campaign.id, {
          status: 'ACTIVE',
        }),
      ).rejects.toThrow('CAMPAIGN_NO_ELIGIBLE_SENDERS');
    });

    it('resume PAUSED campaign with >=1 eligible sender succeeds', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'ok@test.com' });
      const campaign = await seedCampaignWithSenders(ws.id, [sender.id], CampaignStatus.PAUSED);

      const res = await changeStatusUseCase.resume(ws.id, campaign.id);
      expect(res.status).toBe('ACTIVE');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. SENDER ASSIGNMENT REPLACEMENT & CROSS-WORKSPACE SAFETY
  // ───────────────────────────────────────────────────────────────────────────
  describe('Sender assignment replacement and active campaign protection', () => {
    it('rejects cross-workspace sender assignment', async () => {
      const { ws: ws1 } = await seedWorkspace('WS1');
      const { ws: ws2 } = await seedWorkspace('WS2');
      const { sender: senderWs2 } = await seedSender(ws2.id, { fromEmail: 's2@ws2.com' });
      const campaign = await seedCampaignWithSenders(ws1.id, [], CampaignStatus.DRAFT);

      await expect(
        assignSendersUseCase.execute(ws1.id, campaign.id, { senderAccountIds: [senderWs2.id] }),
      ).rejects.toThrow(AppValidationException);
    });

    it('ACTIVE campaign cannot be assigned 0 senders or only ineligible senders', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 's@test.com' });
      const { sender: pausedSender } = await seedSender(ws.id, { fromEmail: 'p@test.com', senderStatus: SenderStatus.PAUSED });
      const campaign = await seedCampaignWithSenders(ws.id, [sender.id], CampaignStatus.ACTIVE);

      // Attempt to clear senders
      await expect(
        assignSendersUseCase.execute(ws.id, campaign.id, { senderAccountIds: [] }),
      ).rejects.toThrow('ACTIVE_CAMPAIGN_REQUIRES_ELIGIBLE_SENDER');

      // Attempt to assign only paused sender
      await expect(
        assignSendersUseCase.execute(ws.id, campaign.id, { senderAccountIds: [pausedSender.id] }),
      ).rejects.toThrow('ACTIVE_CAMPAIGN_REQUIRES_ELIGIBLE_SENDER');
    });

    it('DRAFT campaign can be assigned 0 senders', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 's@test.com' });
      const campaign = await seedCampaignWithSenders(ws.id, [sender.id], CampaignStatus.DRAFT);

      const res = await assignSendersUseCase.execute(ws.id, campaign.id, { senderAccountIds: [] });
      expect(res.success).toBe(true);

      const activeAssignments = await prisma.campaignSenderAccount.count({
        where: { campaignId: campaign.id, status: AssignmentStatus.ACTIVE },
      });
      expect(activeAssignments).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. ASSIGNMENT / DISPATCH RACE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Assignment / dispatch race semantics', () => {
    it('reserved EmailSend remains valid even if sender is removed from campaign afterwards', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 's1@test.com' })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 's2@test.com' })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id], CampaignStatus.ACTIVE);

      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // 1. Reserve dispatch (picks s1)
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: outreach.id,
        idempotencyKey: 'idem-race-1',
      });

      const reservedSend = await prisma.emailSend.findFirst({ where: { outreachId: outreach.id } });
      expect(reservedSend?.status).toBe(EmailSendStatus.RESERVED);
      const chosenSenderId = reservedSend!.senderAccountId;

      // 2. Remove the chosen sender from campaign assignments, leaving only the other sender
      const remainingSenderId = chosenSenderId === s1.id ? s2.id : s1.id;
      await assignSendersUseCase.execute(ws.id, campaign.id, {
        senderAccountIds: [remainingSenderId],
      });

      // 3. Prove reserved EmailSend remains intact and valid
      const recheckedSend = await prisma.emailSend.findUnique({ where: { id: reservedSend!.id } });
      expect(recheckedSend?.status).toBe(EmailSendStatus.RESERVED);
      expect(recheckedSend?.senderAccountId).toBe(chosenSenderId);

      // 4. Prove that a later NEW EmailSend does NOT select the removed sender, but selects the remaining sender
      const { outreach: o2 } = await seedRecipientAndOutreach(ws.id, campaign.id);
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: o2.id,
        idempotencyKey: 'idem-race-2',
      });
      const newSend = await prisma.emailSend.findFirst({ where: { outreachId: o2.id } });
      expect(newSend?.senderAccountId).toBe(remainingSenderId);
      expect(newSend?.senderAccountId).not.toBe(chosenSenderId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. RETRY PERSISTENCE & TIMESTAMPS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Retry persistence, sender retention, and quota timestamps', () => {
    it('retry retains original sender, verifies capacity, and clears error details', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'ret@test.com', dailyLimit: 5 });
      const campaign = await seedCampaignWithSenders(ws.id, [sender.id]);
      const { outreach, pca } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Create a failed/pending EmailSend directly
      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          sequence: 0,
          type: EmailSendType.INITIAL,
          subject: 'Failed send',
          body: 'Hello',
          status: EmailSendStatus.PENDING,
          errorMessage: 'Transient SMTP timeout',
          errorCode: 'TIMEOUT',
        },
      });

      // Call retry reservation
      await prisma.$transaction(async (tx) => {
        await eligibilityService.reservePendingEmailSendForRetry(
          tx,
          ws.id,
          emailSend.id,
          pca.stateVersion,
        );
      });

      const retried = await prisma.emailSend.findUnique({ where: { id: emailSend.id } });
      expect(retried?.status).toBe(EmailSendStatus.RESERVED);
      expect(retried?.senderAccountId).toBe(sender.id);
      expect(retried?.errorMessage).toBeNull();
      expect(retried?.errorCode).toBeNull();
      expect(retried?.reservedAt).toBeDefined();
    });

    it('retry throws SENDER_UNAVAILABLE if assigned sender became inactive', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'ret-inact@test.com' });
      const { outreach, pca } = await seedRecipientAndOutreach(ws.id, 'dummy');

      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          status: EmailSendStatus.PENDING,
          subject: 'Sub',
          body: 'Body',
        },
      });

      // Deactivate sender
      await prisma.senderAccount.update({
        where: { id: sender.id },
        data: { status: SenderStatus.DISABLED },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await eligibilityService.reservePendingEmailSendForRetry(
            tx,
            ws.id,
            emailSend.id,
            pca.stateVersion,
          );
        }),
      ).rejects.toThrow('SENDER_UNAVAILABLE');
    });

    it('retry throws SENDER_CAPACITY_EXCEEDED if assigned sender remains eligible but reaches quota', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'ret-quota@test.com', dailyLimit: 1 });
      const { outreach, pca } = await seedRecipientAndOutreach(ws.id, 'dummy');

      // Consume sender dailyLimit: 1 today
      const dummyO = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          status: OutreachStatus.DRAFT,
        },
      });
      await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: dummyO.id,
          senderAccountId: sender.id,
          status: EmailSendStatus.RESERVED,
          subject: 'Consumed',
          body: 'Consumed',
          reservedAt: new Date(),
        },
      });

      // Pending email send to retry
      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          status: EmailSendStatus.PENDING,
          subject: 'Retry',
          body: 'Retry',
        },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await eligibilityService.reservePendingEmailSendForRetry(
            tx,
            ws.id,
            emailSend.id,
            pca.stateVersion,
          );
        }),
      ).rejects.toThrow('SENDER_CAPACITY_EXCEEDED');
    });

    it('cross-midnight retry reservedAt re-evaluation', async () => {
      const { ws } = await seedWorkspace();
      const { sender } = await seedSender(ws.id, { fromEmail: 'midnight@test.com', dailyLimit: 1 });
      const { outreach, pca } = await seedRecipientAndOutreach(ws.id, 'dummy');

      // Create an email send reserved yesterday
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          status: EmailSendStatus.PENDING,
          reservedAt: yesterday,
          createdAt: yesterday,
          subject: 'Sub',
          body: 'Body',
        },
      });

      // Retrying today must succeed because yesterday's send is not in today's UTC quota window
      await prisma.$transaction(async (tx) => {
        await eligibilityService.reservePendingEmailSendForRetry(
          tx,
          ws.id,
          emailSend.id,
          pca.stateVersion,
        );
      });

      const retried = await prisma.emailSend.findUnique({ where: { id: emailSend.id } });
      expect(retried?.status).toBe(EmailSendStatus.RESERVED);
      // Now it counts towards today's quota (1 out of 1)
      // A subsequent new send today should fail due to dailyLimit: 1
      const { outreach: o2 } = await seedRecipientAndOutreach(ws.id, 'dummy');
      await expect(
        prisma.$transaction(async (tx) => {
          await eligibilityService.reserveSenderCapacityAndCreateEmailSend(tx, {
            workspaceId: ws.id,
            outreachId: o2.id,
            sequence: 0,
            type: EmailSendType.INITIAL,
            expectedStateVersion: 0,
            subject: 'Sub',
            body: 'Body',
            preferredSenderAccountId: sender.id,
          });
        }),
      ).rejects.toThrow('SENDER_CAPACITY_EXCEEDED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. FOLLOW-UP USES THE SAME OUTREACH
  // ───────────────────────────────────────────────────────────────────────────
  describe('Follow-up progression on the same Outreach', () => {
    it('creates sequence 1 on the existing Outreach without creating a new Outreach record', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 'f1@test.com' })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id]);
      const { outreach, pca } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Sequence 0
      const send0 = await prisma.$transaction(async (tx) => {
        return eligibilityService.reserveSenderCapacityAndCreateEmailSend(tx, {
          workspaceId: ws.id,
          outreachId: outreach.id,
          sequence: 0,
          type: EmailSendType.INITIAL,
          expectedStateVersion: pca.stateVersion,
          subject: 'Sequence 0',
          body: 'Body 0',
          campaignId: campaign.id,
        });
      });

      // Sequence 1 on the SAME Outreach
      const send1 = await prisma.$transaction(async (tx) => {
        return eligibilityService.reserveSenderCapacityAndCreateEmailSend(tx, {
          workspaceId: ws.id,
          outreachId: outreach.id,
          sequence: 1,
          type: EmailSendType.FOLLOW_UP,
          expectedStateVersion: pca.stateVersion,
          subject: 'Sequence 1 Follow-up',
          body: 'Body 1',
          campaignId: campaign.id,
        });
      });

      expect(send0.outreachId).toBe(outreach.id);
      expect(send1.outreachId).toBe(outreach.id);
      expect(send0.sequence).toBe(0);
      expect(send1.sequence).toBe(1);

      // Total Outreaches in workspace remains exactly 1
      const totalOutreaches = await prisma.outreach.count({ where: { workspaceId: ws.id } });
      expect(totalOutreaches).toBe(1);
    });

    it('Outreach.senderAccountId records the used sender but never acts as selection authority for initial or follow-up', async () => {
      const { ws } = await seedWorkspace();
      const s1 = (await seedSender(ws.id, { fromEmail: 'auth1@test.com', dailyLimit: 10 })).sender;
      const s2 = (await seedSender(ws.id, { fromEmail: 'auth2@test.com', dailyLimit: 10 })).sender;
      const campaign = await seedCampaignWithSenders(ws.id, [s1.id, s2.id]);
      const { outreach } = await seedRecipientAndOutreach(ws.id, campaign.id);

      // Initial send: outreach.senderAccountId starts null
      expect(outreach.senderAccountId).toBeNull();
      await sendOutreachUseCase.execute({
        workspaceId: ws.id,
        outreachId: outreach.id,
        idempotencyKey: 'auth-seq0',
      });

      const updatedOutreach = await prisma.outreach.findUnique({ where: { id: outreach.id } });
      // Records the winning sender
      expect(updatedOutreach?.senderAccountId).toBeDefined();
      const firstUsedSenderId = updatedOutreach!.senderAccountId;

      // Now prepare a follow-up reservation. Even though outreach.senderAccountId is set to firstUsedSenderId,
      // if we consume that sender's capacity or if the other sender is least consumed, the campaign pool is authoritative
      const otherSenderId = firstUsedSenderId === s1.id ? s2.id : s1.id;

      // Make first used sender have 5 sends so other sender is least consumed
      for (let i = 0; i < 5; i++) {
        const dummyO = await prisma.outreach.create({
          data: {
            workspaceId: ws.id,
            personCompanyAssociationId: outreach.personCompanyAssociationId,
            status: OutreachStatus.DRAFT,
          },
        });
        await prisma.emailSend.create({
          data: {
            workspaceId: ws.id,
            outreachId: dummyO.id,
            senderAccountId: firstUsedSenderId!,
            sequence: 0,
            subject: 'Filler',
            body: 'Filler',
            status: EmailSendStatus.SENT,
          },
        });
      }

      // Reserve follow-up sequence 1 passing preferredSenderAccountId: null (as scheduled worker does for campaign-linked)
      const followUpSend = await prisma.$transaction(async (tx) => {
        return eligibilityService.reserveSenderCapacityAndCreateEmailSend(tx, {
          workspaceId: ws.id,
          outreachId: outreach.id,
          sequence: 1,
          type: EmailSendType.FOLLOW_UP,
          expectedStateVersion: updatedOutreach!.expectedStateVersion,
          subject: 'Follow-up subject',
          body: 'Follow-up body',
          campaignId: campaign.id,
          preferredSenderAccountId: null,
        });
      });

      expect(followUpSend.outreachId).toBe(outreach.id);
      expect(followUpSend.sequence).toBe(1);
      // Selected the other sender from pool because firstUsedSenderId was consumed, proving outreach.senderAccountId did not force the sender
      expect(followUpSend.senderAccountId).toBe(otherSenderId);
    });
  });
});
