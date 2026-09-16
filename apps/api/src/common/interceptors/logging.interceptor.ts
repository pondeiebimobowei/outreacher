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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    const method = req?.method ?? 'GET';
    const rawUrl = req?.url ?? req?.path ?? '/';
    // Strip query string parameters to ensure sensitive query tokens/secrets are never logged
    const sanitizedPath = rawUrl.split('?')[0];

    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = res?.statusCode ?? 200;
        this.logger.log(
          `${method} ${sanitizedPath} ${statusCode} +${duration}ms`,
        );
      }),
    );
  }
}
