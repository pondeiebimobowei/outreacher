import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../../src/modules/email/domain/secret-resolver.interface';
import { Integration } from '@prisma/client';

jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation((secret) => ({
    verify: (payload: string, headers: Record<string, string>) => {
      if (
        !headers['svix-id'] ||
        !headers['svix-timestamp'] ||
        !headers['svix-signature']
      ) {
        throw new Error('Missing svix headers');
      }
      if (secret === 'bad') throw new Error('Bad signature');
      return payload;
    },
  })),
}));

jest.unmock('@repo/db');

describe('InboundWebhookController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let integration: Integration;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    const mockSecretResolver = {
      resolve: jest
        .fn()
        .mockResolvedValue({ provider: 'WEBHOOK', secret: 'good' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SECRET_RESOLVER_TOKEN)
      .useValue(mockSecretResolver)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
    await cleanTestDatabase();

    const workspace = await prisma.workspace.create({
      data: { name: 'Test WS' },
    });
    integration = await prisma.integration.create({
      data: {
        workspaceId: workspace.id,
        provider: 'RESEND',
        name: 'My Resend',
        secretReference: 'vault://resend-api',
        webhookSecretReference: 'vault://webhook',
      },
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const validPayload = {
    type: 'email.received',
    created_at: new Date().toISOString(),
    data: {
      email_id: 'e123',
      message_id: 'm123',
      from: 'test@example.com',
      to: ['recipient@example.com'],
      subject: 'Hello',
    },
  };

  it('should accept valid webhook and persist durable state, then suppress duplicates', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integration.id}`)
      .set('svix-id', 'test-event-id')
      .set('svix-timestamp', '123')
      .set('svix-signature', 'sig')
      .send(validPayload);

    expect(res.status).toBe(202);

    const replies = await prisma.inboundReply.count();
    const jobs = await prisma.job.count({
      where: { type: 'WEBHOOK_PROCESSING' },
    });
    const idempotency = await prisma.idempotencyRecord.count();

    expect(replies).toBe(1);
    expect(jobs).toBe(1);
    expect(idempotency).toBe(1);

    // Duplicate webhook should return 202 but not create new records
    const res2 = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integration.id}`)
      .set('svix-id', 'test-event-id')
      .set('svix-timestamp', '123')
      .set('svix-signature', 'sig')
      .send(validPayload);

    expect(res2.status).toBe(202);

    const repliesAfter = await prisma.inboundReply.count();
    const jobsAfter = await prisma.job.count({
      where: { type: 'WEBHOOK_PROCESSING' },
    });
    const idempotencyAfter = await prisma.idempotencyRecord.count();

    expect(repliesAfter).toBe(1);
    expect(jobsAfter).toBe(1);
    expect(idempotencyAfter).toBe(1);
  });

  it('should reject webhook with invalid signature', async () => {
    // Override the mock to simulate a bad secret
    const appWithBadSecret = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SECRET_RESOLVER_TOKEN)
      .useValue({
        resolve: jest
          .fn()
          .mockResolvedValue({ provider: 'WEBHOOK', secret: 'bad' }),
      })
      .compile();

    const nestedApp = appWithBadSecret.createNestApplication({ rawBody: true });
    nestedApp.setGlobalPrefix('api/v1');
    await nestedApp.init();

    const res = await request(nestedApp.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integration.id}`)
      .set('svix-id', 'test-event-id')
      .set('svix-timestamp', '123')
      .set('svix-signature', 'sig')
      .send(validPayload);

    expect(res.status).toBe(400);

    const replies = await prisma.inboundReply.count();
    expect(replies).toBe(0);

    await nestedApp.close();
  });

  it('should reject webhook when Svix verifier rejects due to missing headers', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integration.id}`)
      .send(validPayload);

    expect(res.status).toBe(400);

    const replies = await prisma.inboundReply.count();
    expect(replies).toBe(0);
  });
});
