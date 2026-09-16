import { HttpStatus } from '@nestjs/common';
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  AppProviderFailureException,
  AppUnauthorizedException,
  AppValidationException,
} from './application.exception';
import { ErrorCode } from './error-codes';

describe('Application Exceptions', () => {
  it('AppValidationException should set 400 and VALIDATION_ERROR', () => {
    const error = new AppValidationException(['Field is required']);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    const res = error.getResponse() as Record<string, unknown>;
    expect(res.message).toEqual(['Field is required']);
    expect(res.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('AppUnauthorizedException should set 401 and UNAUTHORIZED', () => {
    const error = new AppUnauthorizedException();
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('AppForbiddenException should set 403 and FORBIDDEN', () => {
    const error = new AppForbiddenException();
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('AppNotFoundException should set 404 and NOT_FOUND', () => {
    const error = new AppNotFoundException('Company');
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.message).toBe('Company not found');
  });

  it('AppConflictException should set 409 and CONFLICT', () => {
    const error = new AppConflictException('Email already registered');
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe(ErrorCode.CONFLICT);
  });

  describe('AppProviderFailureException', () => {
    it('should set 502, PROVIDER_FAILURE, and hide internalCause from client response', () => {
      const sensitiveCause = new Error(
        'Resend API error with key re_secret_token_abc at https://api.resend.com/emails',
      );
      const error = new AppProviderFailureException(
        'resend',
        'send_email',
        'Email delivery provider unavailable',
        sensitiveCause,
      );

      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(error.code).toBe(ErrorCode.PROVIDER_FAILURE);
      expect(error.provider).toBe('resend');
      expect(error.operation).toBe('send_email');
      expect(error.internalCause).toBe(sensitiveCause);

      const res = error.getResponse() as Record<string, unknown>;
      // Client response must NOT contain the sensitive cause
      expect(res.message).toBe('Email delivery provider unavailable');
      expect(res.code).toBe(ErrorCode.PROVIDER_FAILURE);
      expect(res.details).toEqual({
        provider: 'resend',
        operation: 'send_email',
      });
      expect(JSON.stringify(res)).not.toContain('re_secret_token_abc');
    });
  });
});
