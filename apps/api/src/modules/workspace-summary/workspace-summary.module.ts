import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { WorkspaceSummaryController } from './workspace-summary.controller';
import { PrismaWorkspaceSummaryRepository } from './infrastructure/prisma-workspace-summary.repository';
import { GetWorkspaceSummaryUseCase } from './application/get-workspace-summary.use-case';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [WorkspaceSummaryController],
  providers: [PrismaWorkspaceSummaryRepository, GetWorkspaceSummaryUseCase],
})
export class WorkspaceSummaryModule {}
