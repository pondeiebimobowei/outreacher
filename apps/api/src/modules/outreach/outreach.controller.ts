import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { GenerateOutreachUseCase } from './application/generate-outreach.use-case';

@Controller('campaign-contacts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutreachController {
  constructor(
    private readonly generateOutreachUseCase: GenerateOutreachUseCase,
  ) {}

  @Post(':id/generate-outreach')
  @HttpCode(HttpStatus.ACCEPTED)
  public async generateOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignContactId: string,
  ) {
    return this.generateOutreachUseCase.execute({
      workspaceId: workspace.id,
      campaignContactId,
    });
  }
}
