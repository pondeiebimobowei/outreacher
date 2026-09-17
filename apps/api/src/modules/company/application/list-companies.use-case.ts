import { Inject, Injectable } from '@nestjs/common';
import { Company } from '@repo/db';
import {
  COMPANY_REPOSITORY_TOKEN,
  type ICompanyRepository,
} from '../domain/company.repository.interface';

@Injectable()
export class ListCompaniesUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY_TOKEN)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(workspaceId: string): Promise<Company[]> {
    return this.companyRepository.findManyByWorkspace(workspaceId);
  }
}
