import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/application.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

export interface AICompletionInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionResult {
  rawText: string;
}

export interface AIProvider {
  complete(input: AICompletionInput): Promise<AICompletionResult>;
}

export class AIProviderException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.PROVIDER_FAILURE, details);
  }
}

export class AITimeoutException extends AppException {
  constructor(message = 'AI provider request timed out') {
    super(message, HttpStatus.GATEWAY_TIMEOUT, ErrorCode.PROVIDER_FAILURE, {
      timeout: true,
    });
  }
}

export class AIRateLimitException extends AppException {
  constructor(message = 'AI generation quota exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED);
  }
}

export class AIInvalidOutputException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.VALIDATION_ERROR,
      details,
    );
  }
}
