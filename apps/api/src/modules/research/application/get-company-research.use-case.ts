import { Inject, Injectable } from '@nestjs/common';
import {
  CompanyResearchDetails,
  type IResearchRepository,
  RESEARCH_REPOSITORY_TOKEN,
} from '../domain/research.repository.interface';

@Injectable()
export class GetCompanyResearchUseCase {
  constructor(
    @Inject(RESEARCH_REPOSITORY_TOKEN)
    private readonly researchRepository: IResearchRepository,
  ) {}

  async execute(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyResearchDetails> {
    return this.researchRepository.findResearchDetails(workspaceId, companyId);
  }
}
