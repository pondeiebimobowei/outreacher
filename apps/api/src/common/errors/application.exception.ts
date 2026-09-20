import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeType } from './error-codes';

export class AppException extends HttpException {
  public readonly code: ErrorCodeType;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string | string[],
    statusCode: HttpStatus,
    code: ErrorCodeType,
    details?: Record<string, unknown>,
  ) {
    super(
      {
        message,
        code,
        details,
      },
      statusCode,
    );
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class AppValidationException extends AppException {
  constructor(
    message: string | string[] = 'Validation failed',
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(
    message: string = 'Authentication required',
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, details);
  }
}

export class AppForbiddenException extends AppException {
  constructor(
    message: string = 'Access denied',
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, details);
  }
}

export class AppNotFoundException extends AppException {
  constructor(
    resource: string = 'Resource',
    details?: Record<string, unknown>,
  ) {
    super(
      `${resource} not found`,
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      details,
    );
  }
}
export class AppRateLimitException extends AppException {
  constructor(
    resource: string = 'Resource',
    details?: Record<string, unknown>,
  ) {
    super(
      `${resource} rate limit exceeded`,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      details,
    );
  }
}

export class AppConflictException extends AppException {
  constructor(
    message: string = 'Resource conflict',
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT, details);
  }
}

/**
 * Translates external provider failures (email delivery, AI services, research vendors)
 * at the infrastructure boundary into application-level error semantics.
 * Downstream raw vendor errors, secrets, and API keys are strictly retained
 * in server-side diagnostics and NEVER leaked to the client response.
 */
export class AppProviderFailureException extends AppException {
  public readonly provider: string;
  public readonly operation: string;
  public readonly internalCause?: unknown;

  constructor(
    provider: string,
    operation: string,
    safeMessage: string = 'External provider service unavailable',
    internalCause?: unknown,
  ) {
    super(safeMessage, HttpStatus.BAD_GATEWAY, ErrorCode.PROVIDER_FAILURE, {
      provider,
      operation,
    });
    this.provider = provider;
    this.operation = operation;
    this.internalCause = internalCause;
  }
}

export class SystemConfigurationException extends AppException {
  constructor(message: string = 'System configuration error') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_SERVER_ERROR);
  }
}

export class SecretResolutionException extends AppException {
  constructor(message: string = 'Failed to resolve vault secret') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_SERVER_ERROR);
  }
}
