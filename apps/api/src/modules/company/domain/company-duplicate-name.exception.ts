import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/application.exception';

export class CompanyDuplicateNameException extends AppException {
  public readonly existingCompanyId: string;

  constructor(existingCompanyId: string) {
    super(
      'A company with this name already exists in your workspace.',
      HttpStatus.CONFLICT,
      'COMPANY_DUPLICATE_NAME',
      { existingCompanyId },
    );
    this.existingCompanyId = existingCompanyId;
  }

  override getResponse() {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: 'COMPANY_DUPLICATE_NAME',
      message: 'A company with this name already exists in your workspace.',
      existingCompanyId: this.existingCompanyId,
      details: { existingCompanyId: this.existingCompanyId },
    };
  }
}
