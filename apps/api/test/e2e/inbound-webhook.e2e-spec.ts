import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase } from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../../src/modules/email/domain/secret-resolver.interface';

jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation((secret) => ({
    verify: (payload: string, headers: Record<string, string>) => {
      if (secret === 'bad') throw new Error('Bad signature');
      return payload;
    },
  })),
}));

describe('InboundWebhookController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    const mockSecretResolver = {
      resolve: jest.fn().mockResolvedValue({ provider: 'WEBHOOK', secret: 'good' }),
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
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('should accept webhook POST bypassing CSRF and AuthGuard when raw body is processed (mocking integration)', async () => {
    jest.spyOn(prisma.integration, 'findUnique').mockResolvedValue({
      id: 'integration-123',
      workspaceId: 'workspace-123',
      provider: 'RESEND',
      webhookSecretReference: 'vault://webhook',
    } as any);

    jest.spyOn(prisma, '$transaction').mockImplementation(async (cb) => {
      return {};
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/email/inbound/integration-123')
      .set('svix-id', 'test-event-id')
      .send({
        type: 'email.received',
        data: { email_id: '123' }
      });
    
    expect(res.status).toBe(202);
  });
});
