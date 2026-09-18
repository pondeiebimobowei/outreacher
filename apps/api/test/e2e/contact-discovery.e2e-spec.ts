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

const prisma = getTestPrismaClient();

import { AppModule } from '../../src/app.module';

jest.unmock('@repo/db');

describe('Contact Discovery & Selection Engine (e2e)', () => {
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

  describe('GET /api/v1/companies/:companyId/contacts', () => {
    it('returns NOT_STARTED when company has no discovery jobs or contacts', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Acme Corp');

      const res = await request(app.getHttpServer())
        .get(`/api/v1/companies/${company.id}/contacts`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          companyId: company.id,
          status: 'NOT_STARTED',
          selectedContactId: null,
          contacts: [],
          discoveryJob: null,
        }),
      );
    });

    it('enforces tenant isolation and returns 404 for company owned by another workspace', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');
      const company = await createCompany(user1.cookies, 'User1 Private Corp');

      await request(app.getHttpServer())
        .get(`/api/v1/companies/${company.id}/contacts`)
        .set('Cookie', user2.cookies)
        .expect(404);
    });
  });

  describe('POST /api/v1/companies/:companyId/contacts/discover', () => {
    it('starts a contact discovery run and creates a pending background job', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Acme Discovery Corp');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/contacts/discover`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({})
        .expect(202);

      expect(res.body.reused).toBe(false);
      expect(res.body.jobId).toEqual(expect.any(String));

      // Verify Job creation in DB
      const job = await prisma.job.findFirst({
        where: {
          workspaceId: workspace.id,
          id: res.body.jobId,
        },
      });
      expect(job).not.toBeNull();
      expect(job?.type).toBe('DISCOVER_CONTACTS');
      expect(job?.status).toBe('PENDING');
    });

    it('reuses recent completed discovery job (<24h) when forceRefresh is false', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Fresh Discovery Corp');

      // Seed completed job <24h ago
      const completedJob = await prisma.job.create({
        data: {
          workspaceId: workspace.id,
          type: 'DISCOVER_CONTACTS',
          status: 'COMPLETED',
          payload: { companyId: company.id },
          completedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/contacts/discover`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ forceRefresh: false })
        .expect(200);

      expect(res.body.reused).toBe(true);
      expect(res.body.jobId).toBe(completedJob.id);
    });

    it('enforces 3 forced-refreshes per 24h rate limit and returns 429', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');
      const company = await createCompany(cookies, 'Rate Limit Corp');

      // Execute 3 forced refreshes, completing each job
      for (let i = 0; i < 3; i++) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/companies/${company.id}/contacts/discover`)
          .set('Cookie', cookies)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ forceRefresh: true })
          .expect(202);

        // Mark job completed to allow next forced refresh
        await prisma.job.update({
          where: { id: res.body.jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      // 4th forced refresh should fail with 429 CONTACT_FRESHNESS_LIMIT_EXCEEDED
      const res = await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/contacts/discover`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ forceRefresh: true })
        .expect(429);

      expect(res.body).toEqual(
        expect.objectContaining({
          statusCode: 429,
          code: 'CONTACT_FRESHNESS_LIMIT_EXCEEDED',
        }),
      );
    });

    it('enforces tenant isolation on discovery trigger', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');
      const company = await createCompany(user1.cookies, 'User1 Private Corp');

      await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/contacts/discover`)
        .set('Cookie', user2.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({})
        .expect(404);
    });
  });

  describe('POST /api/v1/companies/:companyId/contacts/:contactId/select', () => {
    it('persists selected contact and enforces cross-entity selection integrity', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');
      const companyA = await createCompany(cookies, 'Company A');
      const companyB = await createCompany(cookies, 'Company B');

      const contactA = await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          companyId: companyA.id,
          contactKind: 'PERSON',
          name: 'Alice A',
          email: 'alice@comp-a.com',
          title: 'CTO',
          source: 'COMPANY_WEBSITE',
          confidence: 'HIGH',
        },
      });

      const contactB = await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          companyId: companyB.id,
          contactKind: 'PERSON',
          name: 'Bob B',
          email: 'bob@comp-b.com',
          title: 'CEO',
          source: 'COMPANY_WEBSITE',
          confidence: 'HIGH',
        },
      });

      // Valid selection of contactA for companyA
      const selectRes = await request(app.getHttpServer())
        .post(`/api/v1/companies/${companyA.id}/contacts/${contactA.id}/select`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(201);

      expect(selectRes.body).toEqual(
        expect.objectContaining({
          companyId: companyA.id,
          contactId: contactA.id,
        }),
      );

      // Verify selection record in database
      const dbSelection = await prisma.companyContactSelection.findUnique({
        where: {
          workspaceId_companyId: {
            workspaceId: workspace.id,
            companyId: companyA.id,
          },
        },
      });
      expect(dbSelection?.contactId).toBe(contactA.id);

      // Attempting to select contactB (which belongs to companyB) for companyA must fail with 403 or 404
      await request(app.getHttpServer())
        .post(`/api/v1/companies/${companyA.id}/contacts/${contactB.id}/select`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(403);
    });

    it('enforces tenant isolation on contact selection', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');
      const company = await createCompany(user1.cookies, 'User1 Corp');

      const contact = await prisma.contact.create({
        data: {
          workspaceId: user1.workspace.id,
          companyId: company.id,
          contactKind: 'PERSON',
          name: 'User1 Contact',
          email: 'u1@example.com',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/companies/${company.id}/contacts/${contact.id}/select`)
        .set('Cookie', user2.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(404);
    });
  });
});
