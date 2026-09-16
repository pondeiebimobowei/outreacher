import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockContext: ExecutionContext;
  let mockRequest: Record<string, unknown>;
  let mockResponse: Record<string, unknown>;
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    mockRequest = {
      method: 'GET',
      url: '/api/v1/health?token=secret123',
      requestId: 'test-correlation-id-abc',
    };

    mockResponse = {
      statusCode: 200,
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log successful request completion with stripped query string and correlation requestId', (done) => {
    const callHandler: CallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    interceptor.intercept(mockContext, callHandler).subscribe({
      next: () => {
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /^GET \/api\/v1\/health 200 \+\d+ms \[test-correlation-id-abc\]$/,
          ),
        );
        // Query string must never be logged
        const logEntry = (
          loggerLogSpy.mock.calls[0] as [string, ...unknown[]]
        )[0];
        expect(logEntry).not.toContain('token=secret123');
        done();
      },
    });
  });

  it('should not log error requests (>= 400), deferring ownership to HttpExceptionFilter', (done) => {
    mockResponse.statusCode = 500;
    const callHandler: CallHandler = {
      handle: () => of({ error: 'fail' }),
    };

    interceptor.intercept(mockContext, callHandler).subscribe({
      next: () => {
        // Interceptor must not emit log for >= 400 status
        expect(loggerLogSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
