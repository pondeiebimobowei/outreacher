import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { getRequestId } from '../middleware/request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    const method = req?.method ?? 'GET';
    const rawUrl = req?.url ?? req?.path ?? '/';
    // Primary safety defense: Strip query string parameters completely
    const sanitizedPath = rawUrl.split('?')[0];
    const requestId = getRequestId(req);

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res?.statusCode ?? 200;
          // Only log successful completions (< 400); exceptions are owned exclusively by HttpExceptionFilter
          if (statusCode < 400) {
            this.logger.log(
              `${method} ${sanitizedPath} ${statusCode} +${duration}ms [${requestId}]`,
            );
          }
        },
      }),
    );
  }
}
