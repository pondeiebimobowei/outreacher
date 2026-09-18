import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { GetCompanyResearchUseCase } from './application/get-company-research.use-case';
import { StartCompanyResearchUseCase } from './application/start-company-research.use-case';
import { COMPANY_RESEARCH_PROVIDER_TOKEN } from './domain/research.provider.interface';
import { RESEARCH_REPOSITORY_TOKEN } from './domain/research.repository.interface';
import { MockCompanyResearchProvider } from './infrastructure/mock-company-research.provider';
import { PrismaResearchRepository } from './infrastructure/prisma-research.repository';
import { ResearchController } from './research.controller';
import { ResearchWorker } from './worker/research.worker';
import { ResearchWorkerRunner } from './worker/research-worker.runner';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [ResearchController],
  providers: [
    {
      provide: RESEARCH_REPOSITORY_TOKEN,
      useClass: PrismaResearchRepository,
    },
    {
      provide: COMPANY_RESEARCH_PROVIDER_TOKEN,
      useClass: MockCompanyResearchProvider,
    },
    StartCompanyResearchUseCase,
    GetCompanyResearchUseCase,
    ResearchWorker,
    ResearchWorkerRunner,
  ],
  exports: [
    RESEARCH_REPOSITORY_TOKEN,
    COMPANY_RESEARCH_PROVIDER_TOKEN,
    StartCompanyResearchUseCase,
    GetCompanyResearchUseCase,
    ResearchWorker,
  ],
})
export class ResearchModule {}
