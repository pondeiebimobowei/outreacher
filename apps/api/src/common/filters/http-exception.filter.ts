import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AppException,
  AppProviderFailureException,
} from '../errors/application.exception';
import { ErrorCode } from '../errors/error-codes';
import { getRequestId } from '../middleware/request-id.middleware';

export interface StructuredErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  code: string;
  requestId: string;
  timestamp: string;
  path: string;
  details?: Record<string, unknown>;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = getRequestId(request);

    // Primary safety defense: extract path and strip query string parameters completely
    const rawPath = request?.url ?? request?.path ?? '';
    const sanitizedPath = rawPath.split('?')[0];
    const method = request?.method ?? 'UNKNOWN';

    let statusCode: number;
    let error: string;
    let message: string | string[];
    let code: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      code = exception.code;
      details = exception.details;

      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string | string[]) ?? exception.message;
        error = (resObj.error as string) ?? exception.name;
      } else {
        message = typeof res === 'string' ? res : exception.message;
        error = exception.name;
      }

      if (exception instanceof AppProviderFailureException) {
        // Provider failure log at error level with server-side diagnostic details
        const cause = exception.internalCause;
        let causeMsg = '';
        if (cause instanceof Error) {
          causeMsg = cause.message;
        } else if (typeof cause === 'string') {
          causeMsg = cause;
        } else if (typeof cause === 'number' || typeof cause === 'boolean') {
          causeMsg = `${cause}`;
        } else if (cause !== undefined && cause !== null) {
          try {
            causeMsg = JSON.stringify(cause) ?? '';
          } catch {
            causeMsg = '[Unserializable Cause]';
          }
        }
        const sanitizedCause = this.sanitizeLogMessage(causeMsg);
        this.logger.error(
          `Provider failure on ${method} ${sanitizedPath} [${exception.provider}:${exception.operation}] [${requestId}]: ${sanitizedCause}`,
          exception.internalCause instanceof Error
            ? exception.internalCause.stack
            : undefined,
        );
      } else if (statusCode >= 400 && statusCode < 500) {
        // Expected client application exceptions logged at WARN
        this.logger.warn(
          `${method} ${sanitizedPath} ${statusCode} [${code}] [${requestId}] - ${Array.isArray(message) ? message.join(', ') : message}`,
        );
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string | string[]) ?? exception.message;
        error = (resObj.error as string) ?? exception.name;
      } else {
        message = typeof res === 'string' ? res : exception.message;
        error = exception.name;
      }

      code = this.deriveErrorCode(statusCode);

      // Expected HTTP client exceptions logged at WARN
      if (statusCode >= 400 && statusCode < 500) {
        this.logger.warn(
          `${method} ${sanitizedPath} ${statusCode} [${code}] [${requestId}] - ${Array.isArray(message) ? message.join(', ') : message}`,
        );
      } else {
        this.logger.error(
          `Unexpected failure on ${method} ${sanitizedPath} [${requestId}]: ${this.sanitizeLogMessage(exception.message)}`,
          exception.stack
            ? this.sanitizeLogMessage(exception.stack)
            : undefined,
        );
      }
    } else {
      // Unexpected unhandled exceptions logged at ERROR with sanitized stack traces
      statusCode = Number(HttpStatus.INTERNAL_SERVER_ERROR);
      error = 'Internal Server Error';
      message = 'Internal server error';
      code = ErrorCode.INTERNAL_SERVER_ERROR;

      const rawMessage =
        exception instanceof Error ? exception.message : 'Unknown exception';
      const sanitizedMessage = this.sanitizeLogMessage(rawMessage);
      const stack = exception instanceof Error ? exception.stack : undefined;
      const sanitizedStack = stack ? this.sanitizeLogMessage(stack) : undefined;

      this.logger.error(
        `Unexpected failure on ${method} ${sanitizedPath} [${requestId}]: ${sanitizedMessage}`,
        sanitizedStack,
      );
    }

    const payload: StructuredErrorResponse = {
      statusCode,
      error,
      message,
      code,
      requestId,
      timestamp: new Date().toISOString(),
      path: sanitizedPath,
      ...(details ? { details } : {}),
    };

    response.status(statusCode).json(payload);
  }

  /**
   * Secondary defense: Redacts accidental sensitive credentials from log strings/stacks.
   */
  private sanitizeLogMessage(msg: string): string {
    return msg
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1[REDACTED]$2')
      .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(
        /(token|secret|password|pass|api[_-]?key)=([^&\s]+)/gi,
        '$1=[REDACTED]',
      );
  }

  private deriveErrorCode(status: number): string {
    if (status === Number(HttpStatus.BAD_REQUEST)) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (status === Number(HttpStatus.UNAUTHORIZED)) {
      return ErrorCode.UNAUTHORIZED;
    }
    if (status === Number(HttpStatus.FORBIDDEN)) {
      return ErrorCode.FORBIDDEN;
    }
    if (status === Number(HttpStatus.NOT_FOUND)) {
      return ErrorCode.NOT_FOUND;
    }
    if (status === Number(HttpStatus.CONFLICT)) {
      return ErrorCode.CONFLICT;
    }
    if (status === Number(HttpStatus.BAD_GATEWAY)) {
      return ErrorCode.PROVIDER_FAILURE;
    }
    if (status === Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      return ErrorCode.INTERNAL_SERVER_ERROR;
    }
    return 'HTTP_ERROR';
  }
}
