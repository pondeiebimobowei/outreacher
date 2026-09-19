import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/database/prisma.service';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';

getTestPrismaClient();

import { AppModule } from '../../src/app.module';

jest.unmock('@repo/db');

describe('WorkspaceSummary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  afterEach(async () => {
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

    return { cookies: cookies!, workspace: signupRes.body.workspace };

    return { cookies: cookies!, workspace: profileRes.body.workspaces[0] };
  }

  describe('GET /api/v1/workspace/summary', () => {
    it('returns 200 with an empty summary for a new workspace', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'summary_new@test.com',
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/workspace/summary')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.workspace.id).toBe(workspace.id);
      expect(response.body.workItems).toEqual([]);
      expect(response.body.recentActivity).toEqual([]);
    });

    it('returns correctly mapped activities and work items', async () => {
      const { cookies, workspace } = await createAuthenticatedUser(
        'summary_data@test.com',
      );

      const company = await prisma.company.create({
        data: {
          workspaceId: workspace.id,
          name: 'Summary Test Corp',
          domain: 'summarytest.com',
          status: 'ACTIVE',
          normalizedName: 'summary test corp',
        },
      });

      await prisma.researchRun.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'PARTIAL',
        },
      });

      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 1);

      await prisma.researchRun.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          status: 'COMPLETED',
          completedAt: oldDate,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workspace/summary')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.workItems).toHaveLength(1);
      expect(response.body.workItems[0].kind).toBe('RESEARCH_INCOMPLETE');
      expect(response.body.workItems[0].company.id).toBe(company.id);

      expect(response.body.recentActivity).toHaveLength(1);
      expect(response.body.recentActivity[0].type).toBe('RESEARCH_COMPLETED');
      expect(response.body.recentActivity[0].company.id).toBe(company.id);
      expect(response.body.recentActivity[0]).not.toHaveProperty('actor');
    });

    it('enforces tenant isolation (workspaceId boundaries)', async () => {
      const user1 = await createAuthenticatedUser('tenant1@test.com');
      const user2 = await createAuthenticatedUser('tenant2@test.com');

      const company2 = await prisma.company.create({
        data: {
          workspaceId: user2.workspace.id,
          name: 'Other Tenant Corp',
          domain: 'other.com',
          status: 'ACTIVE',
          normalizedName: 'other tenant corp',
        },
      });

      await prisma.researchRun.create({
        data: {
          workspaceId: user2.workspace.id,
          companyId: company2.id,
          status: 'PARTIAL',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/workspace/summary')
        .set('Cookie', user1.cookies)
        .expect(200);

      const leakedWorkItems = response.body.workItems.filter(
        (i: any) => i.company.name === 'Other Tenant Corp',
      );
      expect(leakedWorkItems).toHaveLength(0);
      expect(response.body.workItems).toHaveLength(0);
    });
  });
});
