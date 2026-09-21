import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, OutcomeType } from '@repo/db';
import { randomUUID } from 'crypto';
import * as supertest from 'supertest';
const request = supertest.default || supertest;
import { cleanTestDatabase, getTestPrismaClient, setupTestDatabase, teardownTestDatabase } from '../../../test/helpers/db-test-harness';
import { OutcomeModule } from './outcome.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';

// A mock guard to bypass JWT but inject our test user
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { APP_GUARD } from '@nestjs/core';

class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // Use headers to inject the test user
    req.user = { id: req.headers['x-test-user-id'] };
    req.workspace = { id: req.headers['x-test-workspace-id'] };
    return true;
  }
}

describe('OutcomeController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    await setupTestDatabase();
    prisma = getTestPrismaClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        OutcomeModule
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockAuthGuard())
      .overrideGuard(WorkspaceGuard)
      .useValue(new MockAuthGuard())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  async function seedContact(status: string) {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const companyId = randomUUID();
    const campaignId = randomUUID();
    const contactId = randomUUID();
    const campaignContactId = randomUUID();

    await prisma.workspace.create({ data: { id: workspaceId, name: 'E2E WS' } });
    await prisma.user.create({ data: { id: userId, email: `test-${userId}@e2e.com`, name: 'User' } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: 'OWNER' } });
    await prisma.company.create({ data: { id: companyId, workspaceId, name: 'E2E Co', normalizedName: 'e2ec' } });
    await prisma.campaign.create({ data: { id: campaignId, workspaceId, companyId, name: 'E2E Camp', normalizedName: 'e2ecamp', status: 'DRAFT', sendingIdentity: 'ME' } });
    await prisma.contact.create({ data: { id: contactId, workspaceId, companyId, contactKind: 'PERSON', name: 'John', email: `${contactId}@e2e.com` } });
    
    await prisma.campaignContact.create({
      data: {
        id: campaignContactId,
        workspaceId,
        campaignId,
        contactId,
        status: status as any,
        targetRole: 'test',
      },
    });

    return { workspaceId, userId, campaignContactId };
  }

  it('/api/v1/campaign-contacts/:id/outcome (POST) - Success', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('REPLIED');

    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaign-contacts/${campaignContactId}/outcome`)
      .set('x-test-user-id', userId)
      .set('x-test-workspace-id', workspaceId)
      .send({
        outcomeType: OutcomeType.QUALIFIED_CONVERSATION,
        notes: 'Vertical API test',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    const outcomeId = response.body.id;

    // Verify DB state
    const contact = await prisma.campaignContact.findUniqueOrThrow({ where: { id: campaignContactId } });
    expect(contact.status).toBe('COMPLETED');

    const outcome = await prisma.outcome.findUniqueOrThrow({ where: { id: outcomeId } });
    expect(outcome.type).toBe('QUALIFIED_CONVERSATION');
    expect(outcome.recordedByUserId).toBe(userId);
    expect(outcome.notes).toBe('Vertical API test');
  });

  it('/api/v1/campaign-contacts/:id/outcome (POST) - 409 Conflict if not REPLIED', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('COMPLETED');

    await request(app.getHttpServer())
      .post(`/api/v1/campaign-contacts/${campaignContactId}/outcome`)
      .set('x-test-user-id', userId)
      .set('x-test-workspace-id', workspaceId)
      .send({
        outcomeType: OutcomeType.QUALIFIED_CONVERSATION,
      })
      .expect(409);
  });

  it('/api/v1/campaign-contacts/:id/outcome (POST) - 404 Not Found if cross-workspace', async () => {
    const { userId, campaignContactId } = await seedContact('REPLIED');
    const wrongWorkspaceId = randomUUID();

    await request(app.getHttpServer())
      .post(`/api/v1/campaign-contacts/${campaignContactId}/outcome`)
      .set('x-test-user-id', userId)
      .set('x-test-workspace-id', wrongWorkspaceId)
      .send({
        outcomeType: OutcomeType.QUALIFIED_CONVERSATION,
      })
      .expect(404);
  });
});
