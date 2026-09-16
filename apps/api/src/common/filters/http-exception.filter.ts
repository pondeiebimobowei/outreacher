import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface StructuredErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  code: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract route path excluding query string parameters for safety
    const rawPath = request?.url ?? request?.path ?? '';
    const sanitizedPath = rawPath.split('?')[0];
    const method = request?.method ?? 'UNKNOWN';

    let statusCode: number;
    let error: string;
    let message: string | string[];
    let code: string;

    if (exception instanceof HttpException) {
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
    } else {
      statusCode = Number(HttpStatus.INTERNAL_SERVER_ERROR);
      error = 'Internal Server Error';
      message = 'Internal server error';
      code = 'INTERNAL_SERVER_ERROR';

      // Log error message and stack trace string safely without serializing request contexts/secrets
      const rawMessage =
        exception instanceof Error ? exception.message : 'Unknown exception';
      const sanitizedMessage = this.sanitizeLogMessage(rawMessage);
      const stack = exception instanceof Error ? exception.stack : undefined;
      const sanitizedStack = stack ? this.sanitizeLogMessage(stack) : undefined;

      this.logger.error(
        `Unexpected failure on ${method} ${sanitizedPath}: ${sanitizedMessage}`,
        sanitizedStack,
      );
    }

    const payload: StructuredErrorResponse = {
      statusCode,
      error,
      message,
      code,
      timestamp: new Date().toISOString(),
      path: sanitizedPath,
    };

    response.status(statusCode).json(payload);
  }

  private sanitizeLogMessage(msg: string): string {
    return msg
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1[REDACTED]$2')
      .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(token|secret|password|pass|key)=([^&\s]+)/gi, '$1=[REDACTED]');
  }

  private deriveErrorCode(status: number): string {
    if (status === Number(HttpStatus.BAD_REQUEST)) {
      return 'VALIDATION_ERROR';
    }
    if (status === Number(HttpStatus.UNAUTHORIZED)) {
      return 'UNAUTHORIZED';
    }
    if (status === Number(HttpStatus.FORBIDDEN)) {
      return 'FORBIDDEN';
    }
    if (status === Number(HttpStatus.NOT_FOUND)) {
      return 'NOT_FOUND';
    }
    if (status === Number(HttpStatus.CONFLICT)) {
      return 'CONFLICT';
    }
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
      return 'TOO_MANY_REQUESTS';
    }
    return 'HTTP_ERROR';
  }
}
