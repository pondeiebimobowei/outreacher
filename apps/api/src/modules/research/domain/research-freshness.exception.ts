import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/application.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

export class ResearchFreshnessLimitException extends AppException {
  public readonly companyId: string;

  constructor(companyId: string) {
    super(
      `Forced research rate limit reached for company ${companyId}. Maximum 3 forced refreshes allowed per 24-hour period.`,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RESEARCH_FRESHNESS_LIMIT_EXCEEDED,
      { companyId },
    );
    this.companyId = companyId;
  }

  override getResponse() {
    return {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: ErrorCode.RESEARCH_FRESHNESS_LIMIT_EXCEEDED,
      message: `Forced research rate limit reached for company ${this.companyId}. Maximum 3 forced refreshes allowed per 24-hour period.`,
      details: { companyId: this.companyId },
    };
  }
}
