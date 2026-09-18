import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { AppModule } from '../../src/app.module';
import { OutreachGenerationWorker } from '../../src/modules/outreach/worker/outreach-generation.worker';

const prisma = getTestPrismaClient();

jest.unmock('@repo/db');

describe('Outreach Generation Engine (e2e)', () => {
  let app: INestApplication<App>;
  let worker: OutreachGenerationWorker;

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
    worker = app.get(OutreachGenerationWorker);
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

  async function createCompany(cookies: string[], name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Cookie', cookies)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ name, websiteUrl: 'https://example.com' })
      .expect(201);
    return res.body;
  }

  async function setupOutreachEntities(cookies: string[], workspaceId: string) {
    const company = await createCompany(cookies, 'Acme AI');

    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        companyId: company.id,
        name: 'Bob Ross',
        email: 'bob@acme.com',
        title: 'CTO',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        companyId: company.id,
        name: 'Outreach Campaign',
        status: 'DRAFT',
      },
    });

    const campaignContact = await prisma.campaignContact.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        status: 'PENDING',
      },
    });

    return { company, contact, campaign, campaignContact };
  }

  describe('POST /api/v1/campaign-contacts/:id/generate-outreach', () => {
    it('returns 202 Accepted and enqueues OUTREACH_GENERATION job', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const { campaignContact } = await setupOutreachEntities(
        cookies,
        workspace.id,
      );

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/campaign-contacts/${campaignContact.id}/generate-outreach`,
        )
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(202);

      expect(res.body).toEqual({
        jobId: expect.any(String),
        status: 'QUEUED',
      });

      // Verify job was persisted in database
      const job = await prisma.job.findUnique({
        where: { id: res.body.jobId },
      });
      expect(job).toBeDefined();
      expect(job?.type).toBe('OUTREACH_GENERATION');
      expect(job?.status).toBe('PENDING');

      // Process job using worker
      await prisma.job.update({
        where: { id: job!.id },
        data: { status: 'RUNNING' },
      });
      const processed = await worker.processJob(job!.id);
      expect(processed).toBe(true);

      // Verify CampaignContact was updated with generated subject/body while status stays PENDING
      const updatedCC = await prisma.campaignContact.findUnique({
        where: { id: campaignContact.id },
      });
      expect(updatedCC?.currentSubject).toBeTruthy();
      expect(updatedCC?.currentBody).toBeTruthy();
      expect(updatedCC?.outreachReason).toBeTruthy();
      expect(updatedCC?.status).toBe('PENDING');
    });

    it('enforces tenant isolation and rejects cross-tenant requests with 403', async () => {
      const { cookies: cookies1, workspace: ws1 } =
        await createAuthenticatedUser('user1@example.com');
      const { cookies: cookies2 } =
        await createAuthenticatedUser('user2@example.com');

      const { campaignContact } = await setupOutreachEntities(cookies1, ws1.id);

      await request(app.getHttpServer())
        .post(
          `/api/v1/campaign-contacts/${campaignContact.id}/generate-outreach`,
        )
        .set('Cookie', cookies2)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(403);
    });

    it('enforces 20 calls/hr rate limit per user/workspace with HTTP 429', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const { campaignContact } = await setupOutreachEntities(
        cookies,
        workspace.id,
      );

      // Seed 20 jobs in the past hour
      for (let i = 0; i < 20; i++) {
        await prisma.job.create({
          data: {
            workspaceId: workspace.id,
            type: 'OUTREACH_GENERATION',
            status: 'COMPLETED',
            payload: {},
          },
        });
      }

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/campaign-contacts/${campaignContact.id}/generate-outreach`,
        )
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(429);

      expect(res.body.message).toContain('limit reached');
    });
  });
});
