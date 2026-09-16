import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Application Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let loggerWarnSpy: jest.SpyInstance;

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
    await app.close();
  });

  it('/api/v1/health (GET) should respond with health status and set x-request-id header', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('/api/v1 (GET) should return hello world from AppController', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  describe('End-to-End Correlation Invariants', () => {
    it('should propagate valid x-request-id across response header, error JSON, and server logs', async () => {
      const validId = 'corr-id-valid-9988.abc';

      const res = await request(app.getHttpServer())
        .get('/api/v1/non-existent-endpoint')
        .set('x-request-id', validId)
        .expect(404);

      // 1. Response header contains exact valid ID
      expect(res.headers['x-request-id']).toBe(validId);

      // 2. Error body contains exact valid ID
      expect(res.body).toHaveProperty('requestId', validId);
      expect(res.body).toHaveProperty('code', 'NOT_FOUND');

      // 3. Server-side log context contains exact valid ID
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${validId}]`),
      );
    });

    it('should reject invalid x-request-id, generate a safe UUID, and use it consistently across header, body, and logs', async () => {
      const invalidId = 'invalid id with spaces!@#$%^&*()';

      const res = await request(app.getHttpServer())
        .get('/api/v1/non-existent-endpoint')
        .set('x-request-id', invalidId)
        .expect(404);

      const generatedId = res.headers['x-request-id'];
      expect(generatedId).toBeDefined();
      expect(generatedId).not.toBe(invalidId);
      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      // Error body matches the newly generated UUID
      expect(res.body).toHaveProperty('requestId', generatedId);

      // Server log recorded the safe generated UUID, not the invalid incoming string
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${generatedId}]`),
      );
      const allLogMessages = (
        loggerWarnSpy.mock.calls as [string, ...unknown[]][]
      )
        .map((c) => c[0])
        .join(' ');
      expect(allLogMessages).not.toContain(invalidId);
    });
  });
});
