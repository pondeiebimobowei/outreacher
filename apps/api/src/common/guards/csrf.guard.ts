import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppForbiddenException } from '../errors/application.exception';
import { IS_PUBLIC_CSRF_KEY } from '../decorators/skip-csrf.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublicCsrf = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Custom header check only applies to state-changing methods
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return true;
    }

    // Explicitly exempt Google OAuth callback route if hit via POST (though it's GET)
    if (request.path.includes('/auth/google/callback')) {
      return true;
    }

    const hasCustomHeader = Boolean(
      request.headers['x-requested-with'] ||
      request.headers['x-csrf-token'] ||
      request.headers['X-Requested-With'] ||
      request.headers['X-CSRF-Token'],
    );

    if (!hasCustomHeader) {
      throw new AppForbiddenException(
        'CSRF protection: Custom header X-Requested-With or x-csrf-token is required for state-changing requests.',
      );
    }

    return true;
  }
}
