import { Inject, Injectable } from '@nestjs/common';
import { Company } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  COMPANY_REPOSITORY_TOKEN,
  type ICompanyRepository,
} from '../domain/company.repository.interface';

@Injectable()
export class GetCompanyUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY_TOKEN)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(workspaceId: string, id: string): Promise<Company> {
    const company = await this.companyRepository.findById(workspaceId, id);
    if (!company) {
      throw new AppNotFoundException('Company');
    }
    return company;
  }
}
