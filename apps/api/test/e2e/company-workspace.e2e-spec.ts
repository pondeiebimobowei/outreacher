import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { CompanyStatus } from '@repo/db';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';

// Ensure TEST_DATABASE_URL sets process.env.DATABASE_URL before AppModule import
getTestPrismaClient();

import { AppModule } from '../../src/app.module';

jest.unmock('@repo/db');

describe('Company Workspace Engine (e2e)', () => {
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

  // Helper function to sign up user and return session cookie
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

  describe('POST /api/v1/companies', () => {
    it('creates a company with normalized identity and domain', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user1@example.com');

      const res = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Acme Corporation, Inc.',
          websiteUrl: 'https://www.acme.com/about',
          industry: 'Technology',
          location: 'San Francisco, CA',
        })
        .expect(201);

      expect(res.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          workspaceId: workspace.id,
          name: 'Acme Corporation, Inc.',
          normalizedName: 'acme',
          websiteUrl: 'https://www.acme.com/about',
          domain: 'acme.com',
          industry: 'Technology',
          location: 'San Francisco, CA',
          status: CompanyStatus.ACTIVE,
        }),
      );
    });

    it('returns 409 COMPANY_DUPLICATE_NAME with existingCompanyId when duplicate normalized name is created', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const first = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Acme Inc' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'ACME CORPORATION' })
        .expect(409);

      expect(second.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'COMPANY_DUPLICATE_NAME',
          existingCompanyId: first.body.id,
        }),
      );
    });

    it('handles concurrent duplicate creation safely via DB unique constraint catch', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/companies')
          .set('Cookie', cookies)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Stripe Inc' }),
        request(app.getHttpServer())
          .post('/api/v1/companies')
          .set('Cookie', cookies)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Stripe, LLC' }),
      ]);

      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes).toEqual([201, 409]);

      const successRes = res1.status === 201 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      expect(conflictRes.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'COMPANY_DUPLICATE_NAME',
          existingCompanyId: successRes.body.id,
        }),
      );
    });
  });

  describe('GET /api/v1/companies', () => {
    it('returns empty array when workspace has no companies', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const res = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns all workspace-scoped companies ordered by updatedAt desc', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const c1 = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Alpha Inc' });

      const c2 = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Beta Corp' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(c2.body.id);
      expect(res.body[1].id).toBe(c1.body.id);
    });
  });

  describe('GET /api/v1/companies/:id', () => {
    it('returns company details for owner workspace', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const created = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Gamma Ltd' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/companies/${created.body.id}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
    });

    it('enforces tenant isolation and returns 404 for company owned by another workspace', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');

      const compUser1 = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', user1.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'User 1 Company' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/companies/${compUser1.body.id}`)
        .set('Cookie', user2.cookies)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/companies/:id', () => {
    it('updates company details and preserves normalized identity', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const created = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Original Name Inc' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/companies/${created.body.id}`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Renamed Global Corp',
          description: 'New description',
        })
        .expect(200);

      expect(res.body.name).toBe('Renamed Global Corp');
      expect(res.body.normalizedName).toBe('renamed global');
      expect(res.body.description).toBe('New description');
    });

    it('handles 3-way websiteUrl PATCH semantics correctly', async () => {
      const { cookies } = await createAuthenticatedUser('user1@example.com');

      const created = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Tech Inc',
          websiteUrl: 'https://www.tech.com',
        })
        .expect(201);

      expect(created.body.domain).toBe('tech.com');

      // 1. Omitted websiteUrl in PATCH -> preserves existing websiteUrl and domain
      const patchOmitted = await request(app.getHttpServer())
        .patch(`/api/v1/companies/${created.body.id}`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ description: 'Adding description' })
        .expect(200);

      expect(patchOmitted.body.websiteUrl).toBe('https://www.tech.com/');
      expect(patchOmitted.body.domain).toBe('tech.com');

      // 2. null websiteUrl in PATCH -> clears both websiteUrl and domain
      const patchNull = await request(app.getHttpServer())
        .patch(`/api/v1/companies/${created.body.id}`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ websiteUrl: null })
        .expect(200);

      expect(patchNull.body.websiteUrl).toBeNull();
      expect(patchNull.body.domain).toBeNull();

      // 3. Valid URL string in PATCH -> normalizes both websiteUrl and domain
      const patchValid = await request(app.getHttpServer())
        .patch(`/api/v1/companies/${created.body.id}`)
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ websiteUrl: 'www.newtech.org' })
        .expect(200);

      expect(patchValid.body.websiteUrl).toBe('https://www.newtech.org/');
      expect(patchValid.body.domain).toBe('newtech.org');
    });

    it('enforces tenant isolation on PATCH and returns 404 for cross-workspace update', async () => {
      const user1 = await createAuthenticatedUser('user1@example.com');
      const user2 = await createAuthenticatedUser('user2@example.com');

      const compUser1 = await request(app.getHttpServer())
        .post('/api/v1/companies')
        .set('Cookie', user1.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'User 1 Protected Company' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/companies/${compUser1.body.id}`)
        .set('Cookie', user2.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Hacked Name' })
        .expect(404);
    });
  });
});
