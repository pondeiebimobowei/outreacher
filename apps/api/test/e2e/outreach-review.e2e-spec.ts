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

describe('Outreach Review and Editing (e2e)', () => {
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

  async function seedCampaignContact(workspaceId: string, email: string) {
    const company = await prisma.company.create({
      data: {
        workspaceId,
        name: 'Test Company',
        normalizedName: 'test company',
      },
    });

    const contact = await prisma.person.create({
      data: {
        workspaceId,
        
        email,
        firstName: 'Test',
        lastName: 'Target',
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        companyId: company.id,
        templateId: '',
        senderAccountId: '',
        name: 'Test Campaign',
        normalizedName: 'test campaign',
      },
    });

    const campaignMember = await prisma.campaignMember.create({
      data: {
        workspaceId,
        campaignId: campaign.id,
        personId: '',
        status: 'PENDING',
        currentSubject: 'Initial Subject',
        currentBody: 'Initial Body that is long enough.',
      },
    });

    return { company, contact, campaign, campaignMember };
  }

  describe('PATCH /api/v1/campaign-contacts/:id/draft', () => {
    it('should partially update the draft', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/campaign-contacts/${campaignMember.id}/draft`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          subject: 'Updated Subject',
        })
        .expect(200);

      expect(res.body.currentSubject).toBe('Updated Subject');
      expect(res.body.currentBody).toBe('Initial Body that is long enough.');
    });

    it('should revert READY status to PENDING upon edit', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user2@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target2@example.com',
      );

      // Make it READY manually
      await prisma.campaignMember.update({
        where: { id: campaignMember.id },
        data: { status: 'READY' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/campaign-contacts/${campaignMember.id}/draft`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          bodyText: 'Updated body text that meets the length requirements.',
        })
        .expect(200);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.currentBody).toBe(
        'Updated body text that meets the length requirements.',
      );
    });

    it('should return 400 for empty payloads', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user3@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target3@example.com',
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/campaign-contacts/${campaignMember.id}/draft`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({}) // empty payload
        .expect(400);
    });

    it('should return 404 for cross-tenant access', async () => {
      const tenantA = await createAuthenticatedUser('a@example.com');
      const tenantB = await createAuthenticatedUser('b@example.com');

      const { campaignMember } = await seedCampaignContact(
        tenantA.workspace.id,
        'targeta@example.com',
      );

      // Tenant B tries to edit Tenant A's contact
      await request(app.getHttpServer())
        .patch(`/api/v1/campaign-contacts/${campaignMember.id}/draft`)
        .set('Cookie', tenantB.cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ subject: 'Malicious Subject' })
        .expect(404);
    });
  });

  describe('POST /api/v1/campaign-contacts/:id/approve', () => {
    it('should approve a PENDING draft and set it to READY', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user4@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target4@example.com',
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignMember.id}/approve`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(200);

      expect(res.body.status).toBe('READY');
    });

    it('should return 409 Conflict if recipient is suppressed', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user5@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target5@example.com',
      );

      // Add to suppression
      await prisma.suppression.create({
        data: {
          workspaceId: workspace.id,
          email: 'target5@example.com',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignMember.id}/approve`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(409);
    });

    it('should return 400 Validation Exception if draft is invalid', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user6@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target6@example.com',
      );

      // Corrupt the draft in the DB to be too short
      await prisma.campaignMember.update({
        where: { id: campaignMember.id },
        data: { currentSubject: 'Hi' }, // length < 3
      });

      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignMember.id}/approve`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(400);
    });

    it('should handle READY -> READY idempotently without errors', async () => {
      const { cookies, workspace } =
        await createAuthenticatedUser('user7@example.com');
      const { campaignMember } = await seedCampaignContact(
        workspace.id,
        'target7@example.com',
      );

      // First approval
      await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignMember.id}/approve`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(200);

      // Second approval
      const res = await request(app.getHttpServer())
        .post(`/api/v1/campaign-contacts/${campaignMember.id}/approve`)
        .set('Cookie', cookies!)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send()
        .expect(200);

      expect(res.body.status).toBe('READY');
    });
  });
});
