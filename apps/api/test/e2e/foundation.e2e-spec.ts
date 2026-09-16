import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';

describe('Foundation HTTP Stack (e2e)', () => {
  let app: INestApplication<App>;
  let loggerWarnSpy: jest.SpyInstance;

  beforeAll(async () => {
    // 1. Enforce TEST_DATABASE_URL safety & connect test DB
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    loggerWarnSpy.mockRestore();
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health should return 200 OK and database status UP', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = res.body as {
      status: string;
      timestamp: string;
      uptime: number;
      services?: { database?: { status: string } };
    };

    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body.services?.database).toBeDefined();
    expect(body.services?.database?.status).toBe('UP');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/non-existent-route should return structured 404 error response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .expect(404);

    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body).toHaveProperty('requestId');
    expect(res.body).toHaveProperty('statusCode', 404);
  });

  it('should propagate valid x-request-id header across HTTP response and error payload', async () => {
    const customRequestId = 'valid-test-req-id-12345';

    const res = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .set('x-request-id', customRequestId)
      .expect(404);

    const body = res.body as { requestId: string };
    expect(res.headers['x-request-id']).toBe(customRequestId);
    expect(body.requestId).toBe(customRequestId);
  });

  it('should reject invalid x-request-id header and generate a safe UUID', async () => {
    const invalidRequestId = 'invalid header with spaces & symbols!!';

    const res = await request(app.getHttpServer())
      .get('/api/v1/non-existent-route')
      .set('x-request-id', invalidRequestId)
      .expect(404);

    const body = res.body as { requestId: string };
    const generatedId = res.headers['x-request-id'];
    expect(generatedId).toBeDefined();
    expect(generatedId).not.toBe(invalidRequestId);
    expect(generatedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.requestId).toBe(generatedId);
  });
});
