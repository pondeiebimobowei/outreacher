import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';

jest.unmock('@repo/db');

describe('Career Profile Engine (e2e)', () => {
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

  async function createSessionUser(email: string) {
    const signupRes = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        email,
        password: 'Password123!',
        name: 'Test User',
      })
      .expect(201);
    const cookies = signupRes.get('Set-Cookie') as string[];
    return { cookies, body: signupRes.body };
  }

  describe('Unauthenticated Access Control', () => {
    it('should reject GET /api/v1/profile without authentication cookie with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/profile');

      expect(res.status).toBe(401);
    });

    it('should reject PATCH /api/v1/profile without authentication cookie with 401', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ headline: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  describe('CSRF Guard Enforcement', () => {
    it('should reject PATCH /api/v1/profile missing CSRF header with 403 FORBIDDEN', async () => {
      const { cookies } = await createSessionUser('user-csrf@example.com');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .send({ headline: 'Test' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('should allow PATCH /api/v1/profile with valid CSRF header', async () => {
      const { cookies } = await createSessionUser('user-csrf-pass@example.com');

      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ headline: 'Engineering Lead' });

      expect(res.status).toBe(200);
      expect(res.body.headline).toBe('Engineering Lead');
    });
  });

  describe('Idempotent Autoprovisioning & Atomic Concurrency', () => {
    it('should automatically autoprovision initial profile structure on first GET /api/v1/profile', async () => {
      const { cookies } = await createSessionUser('user-auto@example.com');

      const res = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        workspaceId: expect.any(String),
        headline: null,
        summary: null,
        experienceSummary: null,
        targetRoles: [],
        targetIndustries: [],
        targetLocations: [],
        skills: [],
        portfolioUrl: null,
        githubUrl: null,
        linkedinUrl: null,
        websiteUrl: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should safely handle concurrent initial GET requests without constraint violations', async () => {
      const { cookies } = await createSessionUser(
        'user-concurrent@example.com',
      );

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Cookie', cookies),
        request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Cookie', cookies),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.id).toBe(res2.body.id);
      expect(res1.body.workspaceId).toBe(res2.body.workspaceId);
    });
  });

  describe('PATCH Semantics (Partial Update, Null Clearing, Empty Body)', () => {
    it('should update specified fields while preserving existing values', async () => {
      const { cookies } = await createSessionUser('user-patch@example.com');

      // Initial update with summary and skills
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          summary: 'Original Summary',
          skills: ['TypeScript', 'Rust'],
        });

      // Partial update targeting headline only
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          headline: 'New Staff Headline',
        });

      expect(res.status).toBe(200);
      expect(res.body.headline).toBe('New Staff Headline');
      expect(res.body.summary).toBe('Original Summary');
      expect(res.body.skills).toEqual(['TypeScript', 'Rust']);
    });

    it('should explicitly clear nullable fields when sent as null', async () => {
      const { cookies } = await createSessionUser('user-null@example.com');

      // Set githubUrl
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          githubUrl: 'https://github.com/octocat',
        });

      // Explicitly clear githubUrl
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          githubUrl: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.githubUrl).toBeNull();
    });

    it('should treat PATCH {} with an empty body as a valid no-op / autoprovision operation', async () => {
      const { cookies } = await createSessionUser(
        'user-empty-patch@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('Multi-Session Tenant Isolation', () => {
    it('should prevent User A and User B from reading or mutating each other profiles', async () => {
      const sessionA = await createSessionUser('userA-tenant@example.com');
      const sessionB = await createSessionUser('userB-tenant@example.com');

      // User A updates profile
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', sessionA.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ headline: 'Headline User A', skills: ['SkillA'] });

      // User B updates profile
      await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', sessionB.cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ headline: 'Headline User B', skills: ['SkillB'] });

      // User A reads profile
      const resA = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Cookie', sessionA.cookies);

      // User B reads profile
      const resB = await request(app.getHttpServer())
        .get('/api/v1/profile')
        .set('Cookie', sessionB.cookies);

      expect(resA.status).toBe(200);
      expect(resA.body.headline).toBe('Headline User A');
      expect(resA.body.skills).toEqual(['SkillA']);

      expect(resB.status).toBe(200);
      expect(resB.body.headline).toBe('Headline User B');
      expect(resB.body.skills).toEqual(['SkillB']);

      expect(resA.body.workspaceId).not.toBe(resB.body.workspaceId);
    });
  });

  describe('Transport Validation & Envelope Compliance', () => {
    it('should reject non-whitelisted extra properties with 400 VALIDATION_ERROR', async () => {
      const { cookies } = await createSessionUser(
        'user-invalid-extra@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          headline: 'Valid Headline',
          maliciousProperty: 'Forbidden',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid URL format with 400 VALIDATION_ERROR', async () => {
      const { cookies } = await createSessionUser(
        'user-invalid-url@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch('/api/v1/profile')
        .set('Cookie', cookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          portfolioUrl: 'not-a-valid-url',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
