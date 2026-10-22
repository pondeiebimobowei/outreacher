import { INestApplication } from '@nestjs/common';
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

describe('Direct Outreach Tenant Isolation (e2e)', () => {
  let app: INestApplication<App>;
  let user1Token: string;
  let user2Token: string;
  let workspace1Id: string;
  let workspace2Id: string;
  let outreachW1Id: string;

  beforeAll(async () => {
    await setupTestDatabase();
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    // Set up users and workspaces
    const user1 = await prisma.user.create({ data: { email: 'user1@example.com', defaultWorkspaceId: 'none' } });
    const user2 = await prisma.user.create({ data: { email: 'user2@example.com', defaultWorkspaceId: 'none' } });

    const w1 = await prisma.workspace.create({ data: { name: 'W1', users: { connect: { id: user1.id } } } });
    const w2 = await prisma.workspace.create({ data: { name: 'W2', users: { connect: { id: user2.id } } } });

    await prisma.user.update({ where: { id: user1.id }, data: { defaultWorkspaceId: w1.id } });
    await prisma.user.update({ where: { id: user2.id }, data: { defaultWorkspaceId: w2.id } });

    workspace1Id = w1.id;
    workspace2Id = w2.id;

    // Login
    const login1 = await request(app.getHttpServer()).post('/auth/magic-link/test-login').send({ email: user1.email }).expect(201);
    user1Token = login1.headers['set-cookie'][0].split(';')[0].split('=')[1];

    const login2 = await request(app.getHttpServer()).post('/auth/magic-link/test-login').send({ email: user2.email }).expect(201);
    user2Token = login2.headers['set-cookie'][0].split(';')[0].split('=')[1];

    // Create Outreach in Workspace 1
    const company = await prisma.company.create({ data: { workspaceId: w1.id, name: 'C1', domain: 'c1.com' } });
    const person = await prisma.person.create({ data: { workspaceId: w1.id, email: 'p1@c1.com', firstName: 'P1' } });
    const pca = await prisma.personCompanyAssociation.create({ data: { workspaceId: w1.id, personId: person.id, companyId: company.id } });

    const integration = await prisma.integration.create({ data: { workspaceId: w1.id, provider: 'TEST', secretReference: 'abc', status: 'ACTIVE' } });
    const sender = await prisma.senderAccount.create({ data: { workspaceId: w1.id, integrationId: integration.id, fromEmail: 'me@W1.com', fromName: 'Me', status: 'ACTIVE' } });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: w1.id,
        personCompanyAssociationId: pca.id,
        senderAccountId: sender.id,
        status: 'DRAFT',
        subject: 'W1 Subj',
        message: 'W1 Msg',
      }
    });
    outreachW1Id = outreach.id;
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  it('Workspace 2 user cannot generate W1 outreach', async () => {
    await request(app.getHttpServer())
      .post(`/outreaches/${outreachW1Id}/generate`)
      .set('Cookie', `jwt=${user2Token}`)
      .set('x-workspace-id', workspace2Id)
      .expect(403);
  });

  it('Workspace 2 user cannot edit W1 outreach', async () => {
    await request(app.getHttpServer())
      .patch(`/outreaches/${outreachW1Id}`)
      .set('Cookie', `jwt=${user2Token}`)
      .set('x-workspace-id', workspace2Id)
      .send({ subject: 'Hacked' })
      .expect(404);
  });

  it('Workspace 2 user cannot send W1 outreach', async () => {
    await request(app.getHttpServer())
      .post(`/outreaches/${outreachW1Id}/send`)
      .set('Cookie', `jwt=${user2Token}`)
      .set('x-workspace-id', workspace2Id)
      .expect(404);
  });
  
  it('Workspace 1 user CAN update their own outreach', async () => {
    await request(app.getHttpServer())
      .patch(`/outreaches/${outreachW1Id}`)
      .set('Cookie', `jwt=${user1Token}`)
      .set('x-workspace-id', workspace1Id)
      .send({ subject: 'New Subject W1' })
      .expect(200);
      
    const dbOutreach = await prisma.outreach.findUnique({ where: { id: outreachW1Id } });
    expect(dbOutreach?.subject).toBe('New Subject W1');
  });
});
