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

// Ensure TEST_DATABASE_URL sets process.env.DATABASE_URL before AppModule import
const prisma = getTestPrismaClient();

import { AppModule } from '../../src/app.module';

jest.unmock('@repo/db');

describe('Research Workspace Engine (e2e)', () => {
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
      .send({
        email,
        password,
        name: 'Test User',
      })
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

  describe('POST /api/v1/companies/:companyId/research', () => {
    it('starts a research run and creates a pending background job', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Acme Corp');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({})
        .expect(201);

      expect(res.body.reused).toBe(false);
      expect(res.body.researchRun).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'QUEUED',
        }),
      );

      // Verify Job creation in DB
      const job = await prisma.job.findFirst({
        where: {
          workspaceId: workspace.id,
          idempotencyKey: `research:${res.body.researchRun.id}`,
        },
      });
      expect(job).not.toBeNull();
      expect(job?.status).toBe('PENDING');
      expect(job?.type).toBe('RESEARCH_COMPANY');
    });

    it('reuses recent completed research run (<24h) when forceRefresh is false', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Fresh Corp');

      // Seed completed run <24h ago
      const completedRun = await prisma.researchRun.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ forceRefresh: false })
        .expect(201);

      expect(res.body.reused).toBe(true);
      expect(res.body.researchRun.id).toBe(completedRun.id);
    });

    it('bypasses 24h freshness check when forceRefresh is true', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Force Corp');

      await prisma.researchRun.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ forceRefresh: true })
        .expect(201);

      expect(res.body.reused).toBe(false);
      expect(res.body.researchRun.status).toBe('QUEUED');
    });

    it('enforces 3 forced-refreshes per 24h rate limit and returns 429', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Gamma Research Corp');

      // Execute 3 forced refreshes, completing each run
      for (let i = 0; i < 3; i++) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/companies/${company.id}/research`)
          .set('Cookie', cookies)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ forceRefresh: true })
          .expect(201);

        // Mark run completed to allow next forced refresh
        await prisma.researchRun.update({
          where: { id: res.body.researchRun.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      // 4th forced refresh should fail with 429 RATE_LIMITED
      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ forceRefresh: true })
        .expect(429);

      expect(res.body).toEqual(
        expect.objectContaining({
          statusCode: 429,
          code: 'RATE_LIMITED',
        }),
      );
    });

    it('enforces tenant isolation and returns 404 for company owned by another workspace', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');
      const company = await createCompany(user1.cookies, 'User1 Private Corp');

      await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', user2.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({})
        .expect(404);
    });
  });

  describe('GET /api/v1/companies/:companyId/research', () => {
    it('returns NOT_STARTED when company has no research runs', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'New Corp');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          run: null,
          opportunities: [],
          evidence: [],
          status: 'NOT_STARTED',
          jobStatus: null,
        }),
      );
    });

    it('returns research details including opportunities and evidence', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Researched Corp');

      const run = await prisma.researchRun.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const opp = await prisma.opportunity.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          researchRunId: run.id,
          status: 'ACTIVE',
          roleTitle: 'Senior Backend Engineer',
          opportunityType: 'CONFIRMED',
        },
      });

      const ev = await prisma.evidence.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          researchRunId: run.id,
          claim: 'Company uses NestJS and PostgreSQL',
          classification: 'FACT',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.run.id).toBe(run.id);
      expect(res.body.opportunities).toHaveLength(1);
      expect(res.body.opportunities[0].id).toBe(opp.id);
      expect(res.body.evidence).toHaveLength(1);
      expect(res.body.evidence[0].id).toBe(ev.id);
    });

    it('enforces tenant isolation on GET research', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');
      const company = await createCompany(user1.cookies, 'User1 Company');

      await request(app.getHttpServer())
        .get(`/api/v1/companies/${company.id}/research`)
        .set('Cookie', user2.cookies)
        .expect(404);
    });
  });
});
