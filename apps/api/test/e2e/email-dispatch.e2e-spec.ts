/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  CampaignContactStatus,
  CampaignStatus,
  EmailSendStatus,
  JobStatus,
} from '@repo/db';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { AppModule } from '../../src/app.module';
import { EmailDispatchWorker } from '../../src/modules/email/application/email-dispatch.worker';

const prisma = getTestPrismaClient();

jest.unmock('@repo/db');

describe('Email Dispatch Pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    await setupTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  async function createAuthenticatedUser(
    email: string,
    password = 'Password123!',
  ) {
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email, password, name: 'Test User' })
      .expect(201);

    const cookies = signupRes.get('Set-Cookie');
    return {
      cookies,
      user: signupRes.body.user,
      workspace: signupRes.body.workspace,
    };
  }

  async function seedCampaignContact(
    workspaceId: string,
    params?: {
      companyName?: string;
      email?: string;
      campaignStatus?: CampaignStatus;
      contactStatus?: CampaignContactStatus;
    },
  ) {
    const companyName =
      params?.companyName ||
      `Company-${Math.random().toString(36).slice(2, 9)}`;
    const email =
      params?.email ||
      `lead-${Math.random().toString(36).slice(2, 9)}@enterprise.com`;
    const campaignStatus = params?.campaignStatus || CampaignStatus.DRAFT;
    const contactStatus = params?.contactStatus || CampaignContactStatus.READY;

    const company = await prisma.company.create({
      data: {
        workspaceId,
        name: companyName,
        normalizedName: companyName.toLowerCase(),
        domain: 'enterprise.com',
      },
    });

    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        companyId: company.id,
        email,
        name: 'Alex Mercer',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        companyId: company.id,
        name: 'Q3 Enterprise Outbound',
        status: campaignStatus,
        sendingIdentity: 'founder@startup.com',
      },
    });

    const campaignContact = await prisma.campaignContact.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        status: contactStatus,
        currentSubject: 'Partnership opportunity with Acme',
        currentBody:
          'Hi Alex, I saw your recent launch and wanted to connect regarding partnership opportunities.',
      },
    });

    return { company, contact, campaign, campaignContact };
  }

  describe('POST /api/v1/campaign-contacts/:id/send', () => {
    it('returns 401 Unauthorized when request is unauthenticated and creates no send or job', async () => {
      const { workspace } = await createAuthenticatedUser('owner@test.com');
      const { campaignContact } = await seedCampaignContact(workspace.id);

      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-unauth')
        .expect(401);

      const sends = await prisma.emailSend.findMany({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sends).toHaveLength(0);

      const jobs = await prisma.job.findMany({
        where: { workspaceId: workspace.id, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(0);

      const contact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(contact?.status).toBe(CampaignContactStatus.READY);
    });

    it('returns 400 Bad Request when Idempotency-Key header is missing', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('sender1@test.com');
      const { campaignContact } = await seedCampaignContact(workspace.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(400);

      expect(res.body.message).toContain(
        'Missing required Idempotency-Key header',
      );
    });

    it('returns 404 Not Found when campaign contact does not exist', async () => {
      const { cookies } = await createAuthenticatedUser('sender2@test.com');

      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${nonExistentId}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-404')
        .expect(404);
    });

    it('returns 409 Conflict when contact is not in READY status', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('sender3@test.com');
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.PENDING,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-pending')
        .expect(409);

      expect(res.body.message).toContain('PENDING status');
    });

    it('returns 409 Conflict when campaign is in PAUSED status and creates no send or job', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'paused.campaign@test.com',
      );
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.PAUSED,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-paused')
        .expect(409);

      expect(res.body.message).toContain('PAUSED');

      const sends = await prisma.emailSend.findMany({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sends).toHaveLength(0);

      const jobs = await prisma.job.findMany({
        where: { workspaceId: workspace.id, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(0);

      const contact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(contact?.status).toBe(CampaignContactStatus.READY);
    });

    it('returns 409 Conflict when campaign is in ARCHIVED status and creates no send or job', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'archived.campaign@test.com',
      );
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.ARCHIVED,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-archived')
        .expect(409);

      expect(res.body.message).toContain('ARCHIVED');

      const sends = await prisma.emailSend.findMany({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sends).toHaveLength(0);

      const jobs = await prisma.job.findMany({
        where: { workspaceId: workspace.id, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(0);

      const contact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(contact?.status).toBe(CampaignContactStatus.READY);
    });

    it('returns 409 Conflict when campaign is in SCHEDULED status and creates no send or job', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'scheduled.campaign@test.com',
      );
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.SCHEDULED,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-scheduled')
        .expect(409);

      expect(res.body.message).toContain('SCHEDULED');

      const sends = await prisma.emailSend.findMany({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sends).toHaveLength(0);

      const jobs = await prisma.job.findMany({
        where: { workspaceId: workspace.id, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(0);

      const contact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(contact?.status).toBe(CampaignContactStatus.READY);
    });

    it('returns 409 Conflict when recipient email is suppressed and creates no send or job', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'suppressed.lead@test.com',
      );
      const targetEmail = 'unsubscribed.recipient@target.com';

      const { campaignContact } = await seedCampaignContact(workspace.id, {
        email: targetEmail,
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.DRAFT,
      });

      await prisma.suppression.create({
        data: {
          workspaceId: workspace.id,
          email: targetEmail,
          reason: 'UNSUBSCRIBED',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'key-test-suppressed')
        .expect(409);

      expect(res.body.message).toContain('suppressed');

      const sends = await prisma.emailSend.findMany({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sends).toHaveLength(0);

      const jobs = await prisma.job.findMany({
        where: { workspaceId: workspace.id, type: 'EMAIL_DISPATCH' },
      });
      expect(jobs).toHaveLength(0);

      const contact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(contact?.status).toBe(CampaignContactStatus.READY);
    });

    it('returns 202 Accepted on valid reservation and replays 202 on identical idempotency key', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('sender4@test.com');
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.DRAFT,
      });

      const clientKey = 'idemp-key-e2e-single-send-1';

      // First call: reservation succeeds
      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', clientKey)
        .expect(202);

      expect(firstRes.body.jobId).toBeDefined();
      expect(firstRes.body.message).toBe('Dispatch enqueued');
      const assignedJobId = firstRes.body.jobId;

      // Second call: idempotent replay with identical key returns cached 202
      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', clientKey)
        .expect(202);

      expect(replayRes.body.jobId).toBe(assignedJobId);
      expect(replayRes.body.message).toBe('Dispatch enqueued');

      // Verify contact in DB transitioned to SENDING
      const dbContact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(dbContact?.status).toBe(CampaignContactStatus.SENDING);

      // Verify campaign in DB activated from DRAFT -> ACTIVE
      const dbCampaign = await prisma.campaign.findUnique({
        where: { id: campaignContact.campaignId },
      });
      expect(dbCampaign?.status).toBe(CampaignStatus.ACTIVE);
    });

    it('returns 409 Conflict when the same Idempotency-Key is reused for a different contact', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('sender5@test.com');
      const { campaignContact: contactA } = await seedCampaignContact(
        workspace.id,
        { email: 'alpha@target.com' },
      );
      const { campaignContact: contactB } = await seedCampaignContact(
        workspace.id,
        { email: 'bravo@target.com' },
      );

      const sharedKey = 'idemp-key-reuse-collision-test';

      // Send contact A successfully
      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${contactA.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', sharedKey)
        .expect(202);

      // Send contact B with the same key fails with 409
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${contactB.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', sharedKey)
        .expect(409);

      expect(conflictRes.body.message).toContain(
        `Idempotency-Key '${sharedKey}' was already used for a different campaign contact`,
      );
    });

    it('enforces tenant isolation (caller cannot dispatch a contact from another workspace)', async () => {
      const userA = await createAuthenticatedUser('usera@tenant-a.com');
      const userB = await createAuthenticatedUser('userb@tenant-b.com');

      const { campaignContact } = await seedCampaignContact(userA.workspace.id);

      // User B tries to send contact belonging to User A's workspace
      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', userB.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', 'cross-tenant-key-1')
        .expect(404);
    });
  });

  describe('Worker Execution Lifecycle (e2e)', () => {
    it('claims the enqueued job, invokes dispatch, and transitions EmailSend and CampaignContact to SENT', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'worker.e2e@startup.com',
      );
      const { campaignContact } = await seedCampaignContact(workspace.id, {
        contactStatus: CampaignContactStatus.READY,
        campaignStatus: CampaignStatus.DRAFT,
      });

      const clientKey = 'idemp-key-worker-e2e-run';

      // Enqueue send via HTTP
      const sendRes = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignContact.id}/send`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Idempotency-Key', clientKey)
        .expect(202);

      const jobId = sendRes.body.jobId;

      // Obtain EmailDispatchWorker from application container
      const worker = app.get(EmailDispatchWorker);

      // 1. Claim job
      const claimed = await worker.claimNextJob();
      expect(claimed).not.toBeNull();
      expect(claimed!.job.id).toBe(jobId);
      expect(claimed!.claimedAttempt).toBe(1);

      // Verify intermediate DB status during worker execution:
      // Job is RUNNING, EmailSend is SENDING
      const runningJob = await prisma.job.findUnique({ where: { id: jobId } });
      expect(runningJob?.status).toBe(JobStatus.RUNNING);

      const sendingSend = await prisma.emailSend.findFirst({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sendingSend?.status).toBe(EmailSendStatus.SENDING);

      // 2. Process job
      const success = await worker.processJob(claimed!);
      expect(success).toBe(true);

      // 3. Verify final DB status
      const completedJob = await prisma.job.findUnique({
        where: { id: jobId },
      });
      expect(completedJob?.status).toBe(JobStatus.COMPLETED);
      expect(completedJob?.completedAt).toBeDefined();

      const sentEmail = await prisma.emailSend.findFirst({
        where: { campaignContactId: campaignContact.id },
      });
      expect(sentEmail?.status).toBe(EmailSendStatus.SENT);
      expect(sentEmail?.sentAt).toBeDefined();
      expect(sentEmail?.providerMessageId).toBeDefined();
      // Must follow RFC Message-ID format: <uuid@domain>
      expect(sentEmail?.messageId).toMatch(/^<[a-f0-9-]+@[^>]+>$/);
      // Provider and RFC Message-ID are separate
      expect(sentEmail?.providerMessageId).not.toBe(sentEmail?.messageId);

      const sentContact = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(sentContact?.status).toBe(CampaignContactStatus.SENT);
    });
  });
});
