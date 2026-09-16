import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

/**
 * Validates whether an incoming request ID adheres strictly to safe correlation rules.
 * Must be 1-128 characters containing only ASCII letters, digits, '.', '_', or '-'.
 * Prevents log injection, header injection, and buffer abuse.
 */
export function isValidRequestId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_REQUEST_ID_REGEX.test(id);
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawIncomingHeader =
      req.headers[REQUEST_ID_HEADER] ?? req.headers['X-Request-Id'];

    const rawId = Array.isArray(rawIncomingHeader)
      ? rawIncomingHeader[0]
      : rawIncomingHeader;

    // Validate safe bounded string; fallback to random RFC 4122 v4 UUID if missing or invalid
    const effectiveRequestId = isValidRequestId(rawId) ? rawId : randomUUID();

    // Assign single authoritative source of truth on request object
    req.requestId = effectiveRequestId;

    // Invariant: Always overwrite response header with validated/generated requestId, never raw header
    res.setHeader(REQUEST_ID_HEADER, effectiveRequestId);

    next();
  }
}

/**
 * Helper to safely extract correlated requestId from Request.
 */
export function getRequestId(req?: Request): string {
  if (req?.requestId && isValidRequestId(req.requestId)) {
    return req.requestId;
  }
  return randomUUID();
}
