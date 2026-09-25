
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

const prisma = getTestPrismaClient();

jest.unmock('@repo/db');

describe('Campaign Orchestration (e2e)', () => {
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

  async function seedCompany(workspaceId: string, name = 'Acme Corp') {
    return prisma.company.create({
      data: {
        workspaceId,
        name,
        normalizedName: name.toLowerCase(),
      },
    });
  }

  async function seedContact(
    workspaceId: string,
    email: string,
    firstName: string,
    lastName: string,
  ) {
    return prisma.person.create({
      data: {
        workspaceId,
        email,
        firstName,
        lastName,
      },
    });
  }

  // ─── 1. POST /api/v1/campaigns (Creation) ──────────────────────────────────

  describe('POST /api/v1/campaigns', () => {
    it('creates a campaign in DRAFT status with default followUpDelayBusinessDays', async () => {
      const user = await createAuthenticatedUser('user1@example.com');
      const company = await seedCompany(user.workspace.id, 'Alpha Corp');

      const res = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Q1 Outreach Campaign',
          companyId: company.id,
          senderAccountId: 'sender-identity-ref-01',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Q1 Outreach Campaign');
      expect(res.body.companyId).toBe(company.id);
      expect(res.body.workspaceId).toBe(user.workspace.id);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.senderAccountId).toBe('sender-identity-ref-01');
      expect(res.body.followUpDelayBusinessDays).toBe(4);
    });

    it('rejects creation with 400 when name is empty or whitespace', async () => {
      const user = await createAuthenticatedUser('user2@example.com');
      const company = await seedCompany(user.workspace.id);

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: '',
          companyId: company.id,
        })
        .expect(400);
    });

    it('rejects creation with 400 when followUpDelayBusinessDays is invalid', async () => {
      const user = await createAuthenticatedUser('user3@example.com');
      const company = await seedCompany(user.workspace.id);

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Invalid Delay Campaign',
          companyId: company.id,
          followUpDelayBusinessDays: 0, // min is 1
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Invalid Delay Campaign',
          companyId: company.id,
          followUpDelayBusinessDays: 45, // max is 30
        })
        .expect(400);
    });

    it('rejects creation with 404 when company belongs to another workspace (cross-tenant)', async () => {
      const userA = await createAuthenticatedUser('usera@example.com');
      const userB = await createAuthenticatedUser('userb@example.com');
      const companyB = await seedCompany(userB.workspace.id, 'Beta Corp');

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userA.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Cross-Tenant Campaign',
          companyId: companyB.id,
        })
        .expect(404);
    });

    it('rejects duplicate campaign name for the same company with 409 and CAMPAIGN_ALREADY_EXISTS', async () => {
      const user = await createAuthenticatedUser('user_dup@example.com');
      const company = await seedCompany(user.workspace.id, 'Acme Inc');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Outreach — Acme',
          companyId: company.id,
        })
        .expect(201);

      const existingId = createRes.body.id;

      const dupRes = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'outreach - acme', // hyphen vs em dash + lowercase
          companyId: company.id,
        })
        .expect(409);

      expect(dupRes.body.code).toBe('CAMPAIGN_ALREADY_EXISTS');
      expect(dupRes.body.existingCampaignId).toBe(existingId);
    });

    it('allows same campaign name for different companies in the same workspace', async () => {
      const user = await createAuthenticatedUser('user_scoped@example.com');
      const companyA = await seedCompany(user.workspace.id, 'Company Alpha');
      const companyB = await seedCompany(user.workspace.id, 'Company Beta');

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Q1 Outbound',
          companyId: companyA.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Q1 Outbound',
          companyId: companyB.id,
        })
        .expect(201);
    });
  });

  // ─── 2. GET /api/v1/campaigns (Listing) ────────────────────────────────────

  describe('GET /api/v1/campaigns', () => {
    it('lists only campaigns in the authenticated user workspace', async () => {
      const userA = await createAuthenticatedUser('usera_list@example.com');
      const userB = await createAuthenticatedUser('userb_list@example.com');
      const companyA = await seedCompany(userA.workspace.id, 'Company A');
      const companyB = await seedCompany(userB.workspace.id, 'Company B');

      // Create campaign in Workspace A
      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userA.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Campaign A', companyId: companyA.id })
        .expect(201);

      // Create campaign in Workspace B
      await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userB.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Campaign B', companyId: companyB.id })
        .expect(201);

      // User A lists campaigns — should only see Campaign A
      const resA = await request(app.getHttpServer())
        .get('/api/v1/campaigns')
        .set('Cookie', userA.cookies!)
        .expect(200);

      expect(resA.body).toHaveLength(1);
      expect(resA.body[0].name).toBe('Campaign A');
      expect(resA.body[0].workspaceId).toBe(userA.workspace.id);

      // User B lists campaigns — should only see Campaign B
      const resB = await request(app.getHttpServer())
        .get('/api/v1/campaigns')
        .set('Cookie', userB.cookies!)
        .expect(200);

      expect(resB.body).toHaveLength(1);
      expect(resB.body[0].name).toBe('Campaign B');
      expect(resB.body[0].workspaceId).toBe(userB.workspace.id);
    });
  });

  // ─── 3. GET /api/v1/campaigns/:id (Retrieval) ──────────────────────────────

  describe('GET /api/v1/campaigns/:id', () => {
    it('retrieves a campaign by id when it belongs to the workspace', async () => {
      const user = await createAuthenticatedUser('user_get@example.com');
      const company = await seedCompany(user.workspace.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Get Campaign', companyId: company.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/campaigns/${created.body.id}`)
        .set('Cookie', user.cookies!)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe('Get Campaign');
    });

    it('returns 404 when attempting to retrieve another workspace campaign (cross-tenant)', async () => {
      const userA = await createAuthenticatedUser('usera_get@example.com');
      const userB = await createAuthenticatedUser('userb_get@example.com');
      const companyB = await seedCompany(userB.workspace.id);

      const createdB = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userB.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Campaign B', companyId: companyB.id })
        .expect(201);

      // User A attempts to read Campaign B
      await request(app.getHttpServer())
        .get(`/api/v1/campaigns/${createdB.body.id}`)
        .set('Cookie', userA.cookies!)
        .expect(404);
    });
  });

  // ─── 4. POST /api/v1/campaigns/:id/contacts (Binding) ──────────────────────

  describe('POST /api/v1/campaigns/:id/contacts', () => {
    it('binds contacts with status PENDING and idempotently ignores duplicates', async () => {
      const user = await createAuthenticatedUser('user_bind@example.com');
      const company = await seedCompany(user.workspace.id);
      const contact1 = await seedContact(
        user.workspace.id,
        'c1@example.com',
        'Contact',
        'One',
      );
      const contact2 = await seedContact(
        user.workspace.id,
        'c2@example.com',
        'Contact',
        'Two',
      );

      const created = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Binding Campaign', companyId: company.id })
        .expect(201);

      const campaignId = created.body.id;

      // 1st binding call
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/campaigns/${campaignId}/contacts`)
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ contactIds: [contact1.id, contact2.id] })
        .expect(200);

      expect(res1.body.bound).toHaveLength(2);
      expect(res1.body.ignoredDuplicateCount).toBe(0);
      for (const b of res1.body.bound) {
        expect(b.status).toBe('PENDING');
      }

      // 2nd binding call with same contacts (Idempotent duplicate ignore)
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/campaigns/${campaignId}/contacts`)
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ contactIds: [contact1.id, contact2.id] })
        .expect(200);

      expect(res2.body.bound).toHaveLength(0);
      expect(res2.body.ignoredDuplicateCount).toBe(2);
    });

    it('rejects binding with 400 if contactIds array is empty or missing', async () => {
      const user = await createAuthenticatedUser('user_bind_val@example.com');
      const company = await seedCompany(user.workspace.id);

      const created = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Binding Campaign', companyId: company.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/campaigns/${created.body.id}/contacts`)
        .set('Cookie', user.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ contactIds: [] })
        .expect(400);
    });

    it('rejects binding with 404 when contact belongs to another workspace (cross-tenant)', async () => {
      const userA = await createAuthenticatedUser('usera_contact@example.com');
      const userB = await createAuthenticatedUser('userb_contact@example.com');
      const companyA = await seedCompany(userA.workspace.id, 'Company A');
      const companyB = await seedCompany(userB.workspace.id, 'Company B');
      const contactB = await seedContact(
        userB.workspace.id,
        'contactb@example.com',
        'Contact',
        'B',
      );

      const createdA = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userA.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Campaign A', companyId: companyA.id })
        .expect(201);

      // User A tries to bind contact belonging to User B's workspace
      await request(app.getHttpServer())
        .post(`/api/v1/campaigns/${createdA.body.id}/contacts`)
        .set('Cookie', userA.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ contactIds: [contactB.id] })
        .expect(404);
    });

    it('rejects binding with 404 when campaign belongs to another workspace', async () => {
      const userA = await createAuthenticatedUser(
        'usera_camp_bind@example.com',
      );
      const userB = await createAuthenticatedUser(
        'userb_camp_bind@example.com',
      );
      const companyB = await seedCompany(userB.workspace.id, 'Company B');
      const contactA = await seedContact(
        userA.workspace.id,
        'contacta@example.com',
        'Contact',
        'A',
      );

      const createdB = await request(app.getHttpServer())
        .post('/api/v1/campaigns')
        .set('Cookie', userB.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: 'Campaign B', companyId: companyB.id })
        .expect(201);

      // User A tries to bind contacts to User B's campaign
      await request(app.getHttpServer())
        .post(`/api/v1/campaigns/${createdB.body.id}/contacts`)
        .set('Cookie', userA.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ contactIds: [contactA.id] })
        .expect(404);
    });
  });

  // ─── 5. Lifecycle Controls (Pause, Resume, Archive) ────────────────────────

  describe('Lifecycle Controls', () => {
    describe('POST /api/v1/campaigns/:id/pause', () => {
      it('successfully pauses an ACTIVE campaign', async () => {
        const user = await createAuthenticatedUser('user_pause@example.com');
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Active Campaign', companyId: company.id })
          .expect(201);

        // Manually set status to ACTIVE to simulate active campaign state
        await prisma.campaign.update({
          where: { id: created.body.id },
          data: { status: 'ACTIVE' },
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/pause`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(200);

        expect(res.body.status).toBe('PAUSED');
      });

      it('returns 409 Conflict when attempting to pause a DRAFT campaign', async () => {
        const user = await createAuthenticatedUser(
          'user_pause_conflict@example.com',
        );
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Draft Campaign', companyId: company.id })
          .expect(201);

        // Campaign starts in DRAFT -> pausing must be rejected with 409
        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/pause`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(409);
      });

      it('returns 404 when attempting to pause another workspace campaign', async () => {
        const userA = await createAuthenticatedUser('usera_pause@example.com');
        const userB = await createAuthenticatedUser('userb_pause@example.com');
        const companyB = await seedCompany(userB.workspace.id);

        const createdB = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', userB.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Campaign B', companyId: companyB.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${createdB.body.id}/pause`)
          .set('Cookie', userA.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(404);
      });
    });

    describe('POST /api/v1/campaigns/:id/resume', () => {
      it('successfully resumes a PAUSED campaign to ACTIVE', async () => {
        const user = await createAuthenticatedUser('user_resume@example.com');
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Paused Campaign', companyId: company.id })
          .expect(201);

        // Manually set status to PAUSED
        await prisma.campaign.update({
          where: { id: created.body.id },
          data: { status: 'PAUSED' },
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/resume`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(200);

        expect(res.body.status).toBe('ACTIVE');
      });

      it('returns 409 Conflict when attempting to resume a DRAFT campaign (BL-014 owns activation)', async () => {
        const user = await createAuthenticatedUser(
          'user_resume_draft@example.com',
        );
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Draft Campaign', companyId: company.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/resume`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(409);
      });

      it('returns 404 when attempting to resume another workspace campaign', async () => {
        const userA = await createAuthenticatedUser('usera_resume@example.com');
        const userB = await createAuthenticatedUser('userb_resume@example.com');
        const companyB = await seedCompany(userB.workspace.id);

        const createdB = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', userB.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Campaign B', companyId: companyB.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${createdB.body.id}/resume`)
          .set('Cookie', userA.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(404);
      });
    });

    describe('POST /api/v1/campaigns/:id/archive', () => {
      it('successfully archives a campaign currently in DRAFT status', async () => {
        const user = await createAuthenticatedUser('user_archive@example.com');
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Archive Campaign', companyId: company.id })
          .expect(201);

        const res = await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/archive`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(200);

        expect(res.body.status).toBe('ARCHIVED');
      });

      it('returns 409 Conflict when attempting to archive an already ARCHIVED campaign (terminal)', async () => {
        const user = await createAuthenticatedUser(
          'user_archive_term@example.com',
        );
        const company = await seedCompany(user.workspace.id);

        const created = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Terminal Archive Campaign', companyId: company.id })
          .expect(201);

        // Archive once
        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/archive`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(200);

        // Attempt second archive -> 409
        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${created.body.id}/archive`)
          .set('Cookie', user.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(409);
      });

      it('returns 404 when attempting to archive another workspace campaign', async () => {
        const userA = await createAuthenticatedUser(
          'usera_archive@example.com',
        );
        const userB = await createAuthenticatedUser(
          'userb_archive@example.com',
        );
        const companyB = await seedCompany(userB.workspace.id);

        const createdB = await request(app.getHttpServer())
          .post('/api/v1/campaigns')
          .set('Cookie', userB.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ name: 'Campaign B', companyId: companyB.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/campaigns/${createdB.body.id}/archive`)
          .set('Cookie', userA.cookies!)
          .set('X-Requested-With', 'XMLHttpRequest')
          .expect(404);
      });
    });
  });
});
