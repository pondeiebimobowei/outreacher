import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { GetWorkspaceSummaryUseCase } from './application/get-workspace-summary.use-case';

@Controller('workspace')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class WorkspaceSummaryController {
  constructor(
    private readonly getWorkspaceSummaryUseCase: GetWorkspaceSummaryUseCase,
  ) {}

  @Get('summary')
  public async getSummary(@CurrentWorkspace() workspace: { id: string }) {
    return this.getWorkspaceSummaryUseCase.execute(workspace.id);
  }
}
