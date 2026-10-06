import { PrismaClient, JobStatus, EmailSendStatus, ConversationState, CampaignStatus, CampaignRecipientStatus, OutreachStatus, EmailSendType, IntegrationProvider, IntegrationStatus, SenderStatus, SuppressionReason, SuppressionAction } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
  getTestPgPool,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { MarkContactRepliedUseCase } from '../../src/modules/email/application/mark-contact-replied.use-case';
import { SuppressContactUseCase } from '../../src/modules/contact/application/suppress-contact.use-case';
import { UnsuppressContactUseCase } from '../../src/modules/contact/application/unsuppress-contact.use-case';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';
import { ScheduledFollowUpCheckWorker } from '../../src/modules/email/application/scheduled-follow-up-check.worker';
import { SendEligibilityService } from '../../src/modules/email/domain/send-eligibility.service';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { ScheduleFollowUpUseCase } from '../../src/modules/email/application/schedule-follow-up.use-case';
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

import { PrismaSuppressionChecker } from '../../src/modules/email/infrastructure/prisma-suppression-checker';
import { EmailProviderRegistry } from '../../src/modules/email/infrastructure/email-provider.registry';

describe('Campaign & Outreach Concurrency & Database Boundary (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let markRepliedUseCase: MarkContactRepliedUseCase;
  let suppressUseCase: SuppressContactUseCase;
  let unsuppressUseCase: UnsuppressContactUseCase;
  let eligibilityService: SendEligibilityService;
  let templateEngine: TemplateEngineService;
  let scheduleFollowUpUseCase: ScheduleFollowUpUseCase;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    markRepliedUseCase = new MarkContactRepliedUseCase(prismaService);
    suppressUseCase = new SuppressContactUseCase(prismaService);
    unsuppressUseCase = new UnsuppressContactUseCase(prismaService);
    const suppressionChecker = new PrismaSuppressionChecker(prismaService);
    const mockProviderRegistry = {
      hasAdapter: jest.fn().mockReturnValue(true),
      getAdapter: jest.fn(),
    } as unknown as EmailProviderRegistry;
    eligibilityService = new SendEligibilityService(suppressionChecker, mockProviderRegistry);
    templateEngine = new TemplateEngineService();
    scheduleFollowUpUseCase = new ScheduleFollowUpUseCase(prismaService);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  // Helper fixture builders
  async function seedBasicWorkspace(name = 'Test Workspace') {
    const ws = await prisma.workspace.create({ data: { name } });
    const user = await prisma.user.create({
      data: { email: `admin-${randomUUID()}@test.com`, firstName: 'Admin', lastName: 'User' },
    });
    const integration = await prisma.integration.create({
      data: {
        workspaceId: ws.id,
        name: 'Resend',
        provider: IntegrationProvider.RESEND,
        status: IntegrationStatus.ACTIVE,
        secretReference: 'sec-resend',
      },
    });
    const sender = await prisma.senderAccount.create({
      data: {
        workspaceId: ws.id,
        integrationId: integration.id,
        fromEmail: 'sender@test.com',
        fromName: 'Sender',
        status: SenderStatus.ACTIVE,
        dailyLimit: 100,
      },
    });
    return { ws, user, sender };
  }

  async function seedContact(workspaceId: string, email = 'lead@company.com', companyName = 'Target Co') {
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
        firstName: 'Jane',
        lastName: 'Doe',
      },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId,
        companyId: company.id,
        personId: person.id,
        workEmail: email,
        role: 'Director',
        conversationState: ConversationState.NO_REPLY,
        stateVersion: 0,
      },
    });
    return { company, person, pca };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Recipient Re-query Race with Controlled Barrier
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Recipient re-query race', () => {
    it('captures concurrent CampaignRecipient insertion during 2-step re-query under Campaign lock', async () => {
      const { ws } = await seedBasicWorkspace();
      const { company, pca } = await seedContact(ws.id);

      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          name: 'Q4 Enterprise',
          status: CampaignStatus.ACTIVE,
          maxFollowUps: 2,
        },
      });

      // Recipient 1 initially enrolled
      const recipient1 = await prisma.campaignRecipient.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personCompanyAssociationId: pca.id,
          status: CampaignRecipientStatus.ACTIVE,
        },
      });

      const pool = getTestPgPool();
      const client1 = await pool.connect();
      const client2 = await pool.connect();

      const barrier1 = createBarrier(); // T1 discovered campaigns
      const barrier2 = createBarrier(); // T2 inserted second recipient

      let t1DiscoveredCampaignIds: string[] = [];
      let t1SecondQueryRecipientIds: string[] = [];

      try {
        // T1 execution
        const t1Promise = (async () => {
          await client1.query('BEGIN');

          // Step 1: Discover distinct Campaign IDs on PCA
          const discRes = await client1.query(
            `SELECT DISTINCT campaign_id FROM campaign_recipients WHERE person_company_association_id = $1 AND workspace_id = $2`,
            [pca.id, ws.id],
          );
          t1DiscoveredCampaignIds = discRes.rows.map((r) => r.campaign_id);

          // Signal barrier1: T1 finished discovery
          barrier1.release();

          // Wait on barrier2: wait until T2 inserts new recipient
          await barrier2.wait();

          // Step 2: Lock Campaigns (id ASC FOR UPDATE)
          if (t1DiscoveredCampaignIds.length > 0) {
            await client1.query(
              `SELECT id FROM campaigns WHERE id = ANY($1::text[]) ORDER BY id ASC FOR UPDATE`,
              [t1DiscoveredCampaignIds],
            );
          }

          // Step 3: Re-query CampaignRecipients under Campaign lock
          const requeryRes = await client1.query(
            `SELECT id, status FROM campaign_recipients WHERE person_company_association_id = $1 AND workspace_id = $2 ORDER BY id ASC FOR UPDATE`,
            [pca.id, ws.id],
          );
          t1SecondQueryRecipientIds = requeryRes.rows.map((r) => r.id);

          // Step 4: Apply relationship-wide completion to all active/pending recipients on PCA
          await client1.query(
            `UPDATE campaign_recipients SET status = 'COMPLETED', updated_at = NOW() WHERE person_company_association_id = $1 AND workspace_id = $2 AND status IN ('PENDING', 'ACTIVE')`,
            [pca.id, ws.id],
          );

          // Mark PCA REPLIED
          await client1.query(
            `UPDATE person_company_associations SET conversation_state = 'REPLIED', state_version = state_version + 1, updated_at = NOW() WHERE id = $1`,
            [pca.id],
          );

          await client1.query('COMMIT');
        })();

        // T2 execution: concurrent insertion
        const t2Promise = (async () => {
          // Wait until T1 discovers campaign IDs
          await barrier1.wait();

          // T2 inserts Recipient 2 concurrently on the same PCA
          // Create a second company and association or distinct recipient on same PCA
          const company2 = await prisma.company.create({
            data: {
              workspaceId: ws.id,
              name: 'Company Two',
              normalizedName: 'company two',
            },
          });
          const campaign2 = await prisma.campaign.create({
            data: {
              workspaceId: ws.id,
              name: 'Campaign Two',
              status: CampaignStatus.ACTIVE,
            },
          });

          await client2.query(
            `INSERT INTO campaign_recipients (id, workspace_id, campaign_id, person_company_association_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())`,
            [randomUUID(), ws.id, campaign2.id, pca.id],
          );

          // Signal barrier2: T2 inserted new recipient
          barrier2.release();
        })();

        await Promise.all([t1Promise, t2Promise]);

        // Assertions:
        // 1. Initial discovery only saw campaign 1
        expect(t1DiscoveredCampaignIds).toEqual([campaign.id]);
        // 2. The second query under Campaign lock saw BOTH recipients (recipient1 + newly inserted recipient)
        expect(t1SecondQueryRecipientIds).toHaveLength(2);
        expect(t1SecondQueryRecipientIds).toContain(recipient1.id);

        // 3. In the database, both recipients are COMPLETED
        const allRecipients = await prisma.campaignRecipient.findMany({
          where: { personCompanyAssociationId: pca.id },
        });
        expect(allRecipients).toHaveLength(2);
        for (const r of allRecipients) {
          expect(r.status).toBe(CampaignRecipientStatus.COMPLETED);
        }

        // 4. PCA is REPLIED
        const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
          where: { id: pca.id },
        });
        expect(updatedPca.conversationState).toBe(ConversationState.REPLIED);
        expect(updatedPca.stateVersion).toBe(1);
      } finally {
        client1.release();
        client2.release();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Post-Dispatch Pause Race with Controlled Barrier
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Post-dispatch pause race', () => {
    it('sets EmailSend to SENT, skips follow-up scheduling, and preserves Outreach PAUSED when campaign is paused in-flight', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          name: 'Target Campaign',
          status: CampaignStatus.ACTIVE,
          maxFollowUps: 2,
        },
      });

      const recipient = await prisma.campaignRecipient.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personCompanyAssociationId: pca.id,
          status: CampaignRecipientStatus.ACTIVE,
        },
      });

      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          campaignRecipientId: recipient.id,
          senderAccountId: sender.id,
          contentSource: 'MANUAL',
          subject: 'Hello',
          message: 'World',
          status: OutreachStatus.SENDING,
          maxFollowUps: 2,
        },
      });

      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          sequence: 0,
          type: EmailSendType.INITIAL,
          status: EmailSendStatus.RESERVED,
          subject: 'Hello',
          body: 'World',
          provider: 'RESEND',
          replyToToken: `reply-${randomUUID()}`,
          expectedStateVersion: 0,
        },
      });

      const job = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          payload: { emailSendId: emailSend.id, outreachId: outreach.id },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      // Barriers for deterministic pause interleaving during provider API call
      const barrierProviderStart = createBarrier();
      const barrierCampaignPaused = createBarrier();

      const mockAdapter = {
        sendEmail: jest.fn().mockImplementation(async () => {
          barrierProviderStart.release();
          await barrierCampaignPaused.wait();
          return {
            providerMessageId: 'prov-msg-123',
            messageId: '<rfc-msg-123@domain.com>',
          };
        }),
      };

      const mockRegistry: any = {
        getAdapter: jest.fn().mockReturnValue(mockAdapter),
      };
      const mockSecretResolver: any = {
        resolve: jest.fn().mockResolvedValue({ apiKey: 'resend-key' }),
      };

      const worker = new EmailDispatchWorker(
        prismaService,
        mockRegistry,
        mockSecretResolver,
        scheduleFollowUpUseCase,
      );

      // Launch processJob
      const workerPromise = worker.processJob({ job, claimedAttempt: 1 });

      // Wait until provider call is in flight
      await barrierProviderStart.wait();

      // Concurrently PAUSE the Campaign
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.PAUSED },
      });

      // Release provider
      barrierCampaignPaused.release();

      await workerPromise;

      // Assertions:
      // 1. EmailSend marked SENT
      const updatedSend = await prisma.emailSend.findUniqueOrThrow({
        where: { id: emailSend.id },
      });
      expect(updatedSend.status).toBe(EmailSendStatus.SENT);
      expect(updatedSend.providerMessageId).toBe('prov-msg-123');

      // 2. Outreach is PAUSED (did NOT transition to ACTIVE)
      const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreach.id },
      });
      expect(updatedOutreach.status).toBe(OutreachStatus.PAUSED);

      // 3. ZERO follow-up jobs scheduled
      const followUpJobs = await prisma.job.findMany({
        where: {
          workspaceId: ws.id,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { path: ['outreachId'], equals: outreach.id },
        },
      });
      expect(followUpJobs).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. AI Follow-Up Unrelated State-Version Change
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. AI follow-up unrelated state-version change', () => {
    it('succeeds in Phase 3 when PCA stateVersion advanced but conversationState remains ACTIVE', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      // Set initial PCA stateVersion = 5, ACTIVE
      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.ACTIVE, stateVersion: 5 },
      });

      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          contentSource: 'AI',
          aiPromptContext: 'Target CFOs',
          subject: 'AI Initial',
          message: 'AI Body',
          status: OutreachStatus.ACTIVE,
          maxFollowUps: 2,
        },
      });

      const followUpJob = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          status: JobStatus.RUNNING,
          payload: { outreachId: outreach.id, sequence: 1 },
          idempotencyKey: `follow-up:${outreach.id}:1`,
        },
      });

      const barrierLlmStart = createBarrier();
      const barrierVersionBumped = createBarrier();

      const mockAiProvider: any = {
        complete: jest.fn().mockImplementation(async () => {
          barrierLlmStart.release();
          await barrierVersionBumped.wait();
          return {
            rawText: JSON.stringify({
              subject: 'AI Follow Up Subject',
              body: 'AI Follow Up Body',
            }),
          };
        }),
      };

      const worker = new ScheduledFollowUpCheckWorker(
        prismaService,
        templateEngine,
        eligibilityService,
        mockAiProvider,
      );

      const workerPromise = worker.processJob({ job: followUpJob, claimedAttempt: 1 });

      // Wait until LLM synthesis starts
      await barrierLlmStart.wait();

      // Independent outreach advances PCA stateVersion from 5 -> 6, but remains ACTIVE
      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { stateVersion: 6, conversationState: ConversationState.ACTIVE },
      });

      // Release LLM
      barrierVersionBumped.release();

      const success = await workerPromise;
      expect(success).toBe(true);

      // Assertions:
      // Exactly 1 EmailSend for sequence 1 created with expectedStateVersion: 6
      const followUpSends = await prisma.emailSend.findMany({
        where: { outreachId: outreach.id, sequence: 1 },
      });
      expect(followUpSends).toHaveLength(1);
      expect(followUpSends[0].status).toBe(EmailSendStatus.RESERVED);
      expect(followUpSends[0].subject).toBe('AI Follow Up Subject');
      expect(followUpSends[0].expectedStateVersion).toBe(6);

      // Outreach transitioned to SENDING
      const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreach.id },
      });
      expect(updatedOutreach.status).toBe(OutreachStatus.SENDING);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. AI Follow-Up Reply Race
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. AI follow-up reply race', () => {
    it('aborts Phase 3 reservation when inbound reply arrives during LLM inference', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.ACTIVE, stateVersion: 3 },
      });

      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          contentSource: 'AI',
          subject: 'AI Initial',
          message: 'AI Body',
          status: OutreachStatus.ACTIVE,
          maxFollowUps: 2,
        },
      });

      const followUpJob = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          status: JobStatus.RUNNING,
          payload: { outreachId: outreach.id, sequence: 1 },
          idempotencyKey: `follow-up:${outreach.id}:1`,
        },
      });

      const barrierLlmStart = createBarrier();
      const barrierReplyArrived = createBarrier();

      const mockAiProvider: any = {
        complete: jest.fn().mockImplementation(async () => {
          barrierLlmStart.release();
          await barrierReplyArrived.wait();
          return {
            rawText: JSON.stringify({
              subject: 'Follow Up',
              body: 'Body',
            }),
          };
        }),
      };

      const worker = new ScheduledFollowUpCheckWorker(
        prismaService,
        templateEngine,
        eligibilityService,
        mockAiProvider,
      );

      const workerPromise = worker.processJob({ job: followUpJob, claimedAttempt: 1 });

      await barrierLlmStart.wait();

      // Concurrent reply arrives -> PCA becomes REPLIED
      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.REPLIED, stateVersion: 4 },
      });

      barrierReplyArrived.release();

      const success = await workerPromise;
      expect(success).toBe(false);

      // Assertions:
      // ZERO EmailSends created for sequence 1
      const sends = await prisma.emailSend.findMany({
        where: { outreachId: outreach.id, sequence: 1 },
      });
      expect(sends).toHaveLength(0);

      // Outreach remains ACTIVE, not SENDING
      const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreach.id },
      });
      expect(updatedOutreach.status).toBe(OutreachStatus.ACTIVE);

      // PCA remains REPLIED
      const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(updatedPca.conversationState).toBe(ConversationState.REPLIED);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Suppression and Unsuppression Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Suppression / unsuppression against real PostgreSQL', () => {
    it('suppresses across all matching workspace PCAs and unsuppresses safely with zero automated sends', async () => {
      const { ws, user, sender } = await seedBasicWorkspace();

      const email = 'target.executive@enterprise.com';
      const company1 = await prisma.company.create({
        data: { workspaceId: ws.id, name: 'Enterprise Alpha', normalizedName: 'enterprise alpha' },
      });
      const company2 = await prisma.company.create({
        data: { workspaceId: ws.id, name: 'Enterprise Beta', normalizedName: 'enterprise beta' },
      });
      const person = await prisma.person.create({
        data: { workspaceId: ws.id, email, firstName: 'Alex', lastName: 'Taylor' },
      });

      const pca1 = await prisma.personCompanyAssociation.create({
        data: {
          workspaceId: ws.id,
          personId: person.id,
          companyId: company1.id,
          workEmail: email,
          conversationState: ConversationState.ACTIVE,
          stateVersion: 1,
        },
      });
      const pca2 = await prisma.personCompanyAssociation.create({
        data: {
          workspaceId: ws.id,
          personId: person.id,
          companyId: company2.id,
          workEmail: email,
          conversationState: ConversationState.ACTIVE,
          stateVersion: 1,
        },
      });

      const campaign = await prisma.campaign.create({
        data: { workspaceId: ws.id, name: 'Enterprise Campaign', status: CampaignStatus.ACTIVE },
      });
      const recipient1 = await prisma.campaignRecipient.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personCompanyAssociationId: pca1.id,
          status: CampaignRecipientStatus.ACTIVE,
        },
      });
      const recipient2 = await prisma.campaignRecipient.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personCompanyAssociationId: pca2.id,
          status: CampaignRecipientStatus.ACTIVE,
        },
      });

      const outreach1 = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca1.id,
          campaignRecipientId: recipient1.id,
          status: OutreachStatus.ACTIVE,
        },
      });
      const outreach2 = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca2.id,
          campaignRecipientId: recipient2.id,
          status: OutreachStatus.ACTIVE,
        },
      });

      const followUpJob = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          status: JobStatus.PENDING,
          payload: { outreachId: outreach1.id },
          idempotencyKey: `fu:${outreach1.id}`,
        },
      });

      const reservedSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach1.id,
          senderAccountId: sender.id,
          sequence: 1,
          status: EmailSendStatus.RESERVED,
          subject: 'S',
          body: 'B',
        },
      });

      // 1. SUPPRESS
      const suppressRes = await suppressUseCase.execute(
        ws.id,
        pca1.id,
        user.id,
        SuppressionReason.USER_REQUEST,
        'User opted out',
      );
      expect(suppressRes.success).toBe(true);

      // Assert suppression consequences in PostgreSQL:
      // Active suppression row created
      const activeSuppression = await prisma.suppression.findUnique({
        where: { workspaceId_email: { workspaceId: ws.id, email } },
      });
      expect(activeSuppression).toBeDefined();

      // Suppression history appended
      const historyRows = await prisma.suppressionHistory.findMany({
        where: { workspaceId: ws.id, email },
      });
      expect(historyRows).toHaveLength(1);
      expect(historyRows[0].action).toBe(SuppressionAction.SUPPRESSED);

      // Both PCAs STOPPED with stateVersion incremented
      const pcasAfterSupp = await prisma.personCompanyAssociation.findMany({
        where: { id: { in: [pca1.id, pca2.id] } },
      });
      for (const p of pcasAfterSupp) {
        expect(p.conversationState).toBe(ConversationState.STOPPED);
        expect(p.stateVersion).toBe(2);
      }

      // Both recipients SUPPRESSED
      const recsAfterSupp = await prisma.campaignRecipient.findMany({
        where: { id: { in: [recipient1.id, recipient2.id] } },
      });
      for (const r of recsAfterSupp) {
        expect(r.status).toBe(CampaignRecipientStatus.SUPPRESSED);
      }

      // Both outreaches PAUSED
      const outreachesAfterSupp = await prisma.outreach.findMany({
        where: { id: { in: [outreach1.id, outreach2.id] } },
      });
      for (const o of outreachesAfterSupp) {
        expect(o.status).toBe(OutreachStatus.PAUSED);
      }

      // Job CANCELLED with cancellationReason: SUPPRESSED
      const jobAfterSupp = await prisma.job.findUniqueOrThrow({
        where: { id: followUpJob.id },
      });
      expect(jobAfterSupp.status).toBe(JobStatus.CANCELLED);
      expect(jobAfterSupp.cancellationReason).toBe('SUPPRESSED');

      // Reserved send CANCELLED
      const sendAfterSupp = await prisma.emailSend.findUniqueOrThrow({
        where: { id: reservedSend.id },
      });
      expect(sendAfterSupp.status).toBe(EmailSendStatus.CANCELLED);

      // 2. UNSUPPRESS
      const unsuppressRes = await unsuppressUseCase.execute(ws.id, pca1.id, user.id);
      expect(unsuppressRes.success).toBe(true);

      // Assert unsuppression consequences in PostgreSQL:
      // Suppression row removed
      const suppAfterUnsupp = await prisma.suppression.findUnique({
        where: { workspaceId_email: { workspaceId: ws.id, email } },
      });
      expect(suppAfterUnsupp).toBeNull();

      // History appended with UNSUPPRESSED
      const historyAfterUnsupp = await prisma.suppressionHistory.findMany({
        where: { workspaceId: ws.id, email },
        orderBy: { createdAt: 'asc' },
      });
      expect(historyAfterUnsupp).toHaveLength(2);
      expect(historyAfterUnsupp[1].action).toBe(SuppressionAction.UNSUPPRESSED);

      // Both PCAs transition STOPPED -> NO_REPLY with stateVersion incremented
      const pcasAfterUnsupp = await prisma.personCompanyAssociation.findMany({
        where: { id: { in: [pca1.id, pca2.id] } },
      });
      for (const p of pcasAfterUnsupp) {
        expect(p.conversationState).toBe(ConversationState.NO_REPLY);
        expect(p.stateVersion).toBe(3);
      }

      // Invariants: Recipients remain SUPPRESSED, outreaches remain PAUSED
      const recsAfterUnsupp = await prisma.campaignRecipient.findMany({
        where: { id: { in: [recipient1.id, recipient2.id] } },
      });
      for (const r of recsAfterUnsupp) {
        expect(r.status).toBe(CampaignRecipientStatus.SUPPRESSED);
      }
      const outreachesAfterUnsupp = await prisma.outreach.findMany({
        where: { id: { in: [outreach1.id, outreach2.id] } },
      });
      for (const o of outreachesAfterUnsupp) {
        expect(o.status).toBe(OutreachStatus.PAUSED);
      }

      // Zero jobs reopened
      const jobAfterUnsupp = await prisma.job.findUniqueOrThrow({
        where: { id: followUpJob.id },
      });
      expect(jobAfterUnsupp.status).toBe(JobStatus.CANCELLED);

      // Zero sends created
      const allSends = await prisma.emailSend.findMany({
        where: { outreachId: { in: [outreach1.id, outreach2.id] } },
      });
      expect(allSends).toHaveLength(1);
      expect(allSends[0].status).toBe(EmailSendStatus.CANCELLED);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Fatal Failure PCA Release
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Fatal failure PCA release', () => {
    it('releases PCA ACTIVE -> NO_REPLY when no other open Outreach exists', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.ACTIVE, stateVersion: 1 },
      });

      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          status: OutreachStatus.SENDING,
        },
      });

      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          sequence: 0,
          status: EmailSendStatus.SENDING,
          subject: 'S',
          body: 'B',
          provider: 'RESEND',
        },
      });

      const job = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          payload: { emailSendId: emailSend.id },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      // Provider throws non-retryable fatal exception
      const mockAdapter = {
        sendEmail: jest.fn().mockRejectedValue(new Error('Permanent mailbox does not exist')),
      };
      const mockRegistry: any = { getAdapter: jest.fn().mockReturnValue(mockAdapter) };
      const mockSecretResolver: any = { resolve: jest.fn().mockResolvedValue({ apiKey: 'k' }) };

      const worker = new EmailDispatchWorker(prismaService, mockRegistry, mockSecretResolver);
      await worker.processJob({ job, claimedAttempt: 3 });

      // Outreach marked FAILED
      const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
        where: { id: outreach.id },
      });
      expect(updatedOutreach.status).toBe(OutreachStatus.FAILED);

      // PCA released immediately from ACTIVE -> NO_REPLY
      const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(updatedPca.conversationState).toBe(ConversationState.NO_REPLY);
      expect(updatedPca.stateVersion).toBe(2);
    });

    it('keeps PCA ACTIVE when another open Outreach exists on that relationship', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.ACTIVE, stateVersion: 1 },
      });

      // Outreach 1 will fail
      const outreach1 = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          status: OutreachStatus.SENDING,
        },
      });

      // Outreach 2 is open (ACTIVE)
      await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          status: OutreachStatus.ACTIVE,
        },
      });

      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach1.id,
          senderAccountId: sender.id,
          sequence: 0,
          status: EmailSendStatus.SENDING,
          subject: 'S',
          body: 'B',
          provider: 'RESEND',
        },
      });

      const job = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          payload: { emailSendId: emailSend.id },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      const mockAdapter = {
        sendEmail: jest.fn().mockRejectedValue(new Error('Fatal error')),
      };
      const mockRegistry: any = { getAdapter: jest.fn().mockReturnValue(mockAdapter) };
      const mockSecretResolver: any = { resolve: jest.fn().mockResolvedValue({ apiKey: 'k' }) };

      const worker = new EmailDispatchWorker(prismaService, mockRegistry, mockSecretResolver);
      await worker.processJob({ job, claimedAttempt: 3 });

      // PCA remains ACTIVE because Outreach 2 is still open
      const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(updatedPca.conversationState).toBe(ConversationState.ACTIVE);
      expect(updatedPca.stateVersion).toBe(1);
    });

    it('keeps PCA REPLIED when a thread fails after relationship was replied', async () => {
      const { ws, sender } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      await prisma.personCompanyAssociation.update({
        where: { id: pca.id },
        data: { conversationState: ConversationState.REPLIED, stateVersion: 4 },
      });

      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          senderAccountId: sender.id,
          status: OutreachStatus.SENDING,
        },
      });

      const emailSend = await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          outreachId: outreach.id,
          senderAccountId: sender.id,
          sequence: 0,
          status: EmailSendStatus.SENDING,
          subject: 'S',
          body: 'B',
          provider: 'RESEND',
        },
      });

      const job = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.RUNNING,
          payload: { emailSendId: emailSend.id },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      const mockAdapter = {
        sendEmail: jest.fn().mockRejectedValue(new Error('Fatal delivery error')),
      };
      const mockRegistry: any = { getAdapter: jest.fn().mockReturnValue(mockAdapter) };
      const mockSecretResolver: any = { resolve: jest.fn().mockResolvedValue({ apiKey: 'k' }) };

      const worker = new EmailDispatchWorker(prismaService, mockRegistry, mockSecretResolver);
      await worker.processJob({ job, claimedAttempt: 3 });

      // PCA remains REPLIED
      const updatedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(updatedPca.conversationState).toBe(ConversationState.REPLIED);
      expect(updatedPca.stateVersion).toBe(4);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Atomic Transaction Rollback & Tenant Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Atomic transaction rollback & tenant isolation', () => {
    it('rolls back all mutations across PCA, recipients, and jobs on error during reply handling', async () => {
      const { ws } = await seedBasicWorkspace();
      const { pca } = await seedContact(ws.id);

      const campaign = await prisma.campaign.create({
        data: { workspaceId: ws.id, name: 'C1', status: CampaignStatus.ACTIVE },
      });
      const recipient = await prisma.campaignRecipient.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personCompanyAssociationId: pca.id,
          status: CampaignRecipientStatus.ACTIVE,
        },
      });
      const outreach = await prisma.outreach.create({
        data: {
          workspaceId: ws.id,
          personCompanyAssociationId: pca.id,
          campaignRecipientId: recipient.id,
          status: OutreachStatus.ACTIVE,
        },
      });
      const job = await prisma.job.create({
        data: {
          workspaceId: ws.id,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          status: JobStatus.PENDING,
          payload: { outreachId: outreach.id },
          idempotencyKey: `fu:${outreach.id}`,
        },
      });

      // Simulate a failure inside transaction after some updates have executed
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.personCompanyAssociation.update({
            where: { id: pca.id },
            data: { conversationState: ConversationState.REPLIED },
          });
          await tx.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: CampaignRecipientStatus.COMPLETED },
          });
          // Deliberate error before commit
          throw new Error('Simulated pre-commit error');
        }),
      ).rejects.toThrow('Simulated pre-commit error');

      // Assert complete rollback in PostgreSQL
      const revertedPca = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pca.id },
      });
      expect(revertedPca.conversationState).toBe(ConversationState.NO_REPLY);

      const revertedRecipient = await prisma.campaignRecipient.findUniqueOrThrow({
        where: { id: recipient.id },
      });
      expect(revertedRecipient.status).toBe(CampaignRecipientStatus.ACTIVE);

      const revertedJob = await prisma.job.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(revertedJob.status).toBe(JobStatus.PENDING);
    });

    it('enforces tenant boundary: workspace A operations never mutate workspace B entities', async () => {
      const { ws: wsA } = await seedBasicWorkspace('Workspace A');
      const { ws: wsB } = await seedBasicWorkspace('Workspace B');

      const { pca: pcaA } = await seedContact(wsA.id, 'shared@domain.com', 'Company A');
      const { pca: pcaB } = await seedContact(wsB.id, 'shared@domain.com', 'Company B');

      // Attempting to execute MarkContactReplied in Workspace A for PCA B fails
      await expect(markRepliedUseCase.execute(pcaB.id, wsA.id)).rejects.toThrow();

      // PCA B remains NO_REPLY
      const freshPcaB = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pcaB.id },
      });
      expect(freshPcaB.conversationState).toBe(ConversationState.NO_REPLY);

      // Now execute for PCA A in Workspace A
      await markRepliedUseCase.execute(pcaA.id, wsA.id);

      const freshPcaA = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pcaA.id },
      });
      expect(freshPcaA.conversationState).toBe(ConversationState.REPLIED);

      // PCA B still completely untouched in Workspace B
      const untouchedPcaB = await prisma.personCompanyAssociation.findUniqueOrThrow({
        where: { id: pcaB.id },
      });
      expect(untouchedPcaB.conversationState).toBe(ConversationState.NO_REPLY);
    });
  });
});
