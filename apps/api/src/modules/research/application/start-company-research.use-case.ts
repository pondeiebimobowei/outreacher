import { Inject, Injectable } from '@nestjs/common';
import {
  type IResearchRepository,
  RESEARCH_REPOSITORY_TOKEN,
  type StartResearchResult,
} from '../domain/research.repository.interface';
import { StartResearchDto } from '../dto/start-research.dto';

@Injectable()
export class StartCompanyResearchUseCase {
  constructor(
    @Inject(RESEARCH_REPOSITORY_TOKEN)
    private readonly researchRepository: IResearchRepository,
  ) {}

  async execute(
    workspaceId: string,
    companyId: string,
    dto?: StartResearchDto,
  ): Promise<StartResearchResult> {
    return this.researchRepository.startResearch({
      workspaceId,
      companyId,
      forceRefresh: dto?.forceRefresh ?? false,
    });
  }
}
