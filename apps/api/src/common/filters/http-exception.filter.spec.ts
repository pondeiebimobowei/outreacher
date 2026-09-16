import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AppProviderFailureException,
  AppValidationException,
} from '../errors/application.exception';
import { ErrorCode } from '../errors/error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let mockArgumentsHost: ArgumentsHost;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/api/v1/resource?token=secret123&api_key=supersecret',
      method: 'GET',
      requestId: 'req-test-uuid-1234',
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse as Response,
        getRequest: () => mockRequest as Request,
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should format ValidationPipe BadRequestException with VALIDATION_ERROR and requestId', () => {
    const exception = new BadRequestException(['title must be a string']);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: ['title must be a string'],
        code: ErrorCode.VALIDATION_ERROR,
        requestId: 'req-test-uuid-1234',
        path: '/api/v1/resource', // Stripped of query parameters
      }),
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'GET /api/v1/resource 400 [VALIDATION_ERROR] [req-test-uuid-1234]',
      ),
    );
  });

  it('should map standard HTTP exceptions to canonical ErrorCode taxonomy', () => {
    // 401 UNAUTHORIZED
    filter.catch(new UnauthorizedException(), mockArgumentsHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        code: ErrorCode.UNAUTHORIZED,
      }),
    );

    // 403 FORBIDDEN
    filter.catch(new ForbiddenException(), mockArgumentsHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: ErrorCode.FORBIDDEN }),
    );

    // 404 NOT_FOUND
    filter.catch(new NotFoundException(), mockArgumentsHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: ErrorCode.NOT_FOUND }),
    );

    // 409 CONFLICT
    filter.catch(new ConflictException(), mockArgumentsHost);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: ErrorCode.CONFLICT }),
    );
  });

  it('should handle App*Exception classes with custom details', () => {
    const appException = new AppValidationException(
      ['Invalid company domain'],
      { field: 'domain' },
    );
    filter.catch(appException, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: ErrorCode.VALIDATION_ERROR,
        message: ['Invalid company domain'],
        details: { field: 'domain' },
        requestId: 'req-test-uuid-1234',
      }),
    );
  });

  it('should translate AppProviderFailureException to 502 PROVIDER_FAILURE and hide internal causes', () => {
    const sensitiveCause = new Error(
      'Failed Resend POST https://api.resend.com with Authorization: Bearer re_secret_key_123',
    );
    const providerException = new AppProviderFailureException(
      'resend',
      'send_email',
      'Email provider service unavailable',
      sensitiveCause,
    );

    filter.catch(providerException, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    const responseBody = (
      mockResponse.json as jest.Mock<void, [Record<string, unknown>]>
    ).mock.calls[0][0];
    expect(responseBody).toEqual(
      expect.objectContaining({
        statusCode: 502,
        code: ErrorCode.PROVIDER_FAILURE,
        message: 'Email provider service unavailable',
        requestId: 'req-test-uuid-1234',
        details: {
          provider: 'resend',
          operation: 'send_email',
        },
      }),
    );
    // Sensitive bearer token must NOT leak to client
    expect(JSON.stringify(responseBody)).not.toContain('re_secret_key_123');

    // Server log must redact the bearer token
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[resend:send_email] [req-test-uuid-1234]'),
      expect.any(String),
    );
    const loggedMessage = (
      loggerErrorSpy.mock.calls[0] as [string, ...unknown[]]
    )[0];
    expect(loggedMessage).not.toContain('re_secret_key_123');
    expect(loggedMessage).toContain('[REDACTED]');
  });

  it('should mask unexpected 500 errors and redact database connection secrets in logs', () => {
    const unexpectedError = new Error(
      'Connection failed at postgresql://postgres:super_secret_db_pass@db.internal:5432/outreacher_dev',
    );

    filter.catch(unexpectedError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const responseBody = (
      mockResponse.json as jest.Mock<void, [Record<string, unknown>]>
    ).mock.calls[0][0];
    expect(responseBody).toEqual(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        requestId: 'req-test-uuid-1234',
        path: '/api/v1/resource',
      }),
    );
    // Client response must not contain password
    expect(JSON.stringify(responseBody)).not.toContain('super_secret_db_pass');

    // Server log must redact the DB password
    const loggedMessage = (
      loggerErrorSpy.mock.calls[0] as [string, ...unknown[]]
    )[0];
    expect(loggedMessage).not.toContain('super_secret_db_pass');
    expect(loggedMessage).toContain('[REDACTED]');
  });
});
