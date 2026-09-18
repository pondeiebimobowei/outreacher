import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { GenerateOutreachUseCase } from './application/generate-outreach.use-case';
import { UpdateDraftUseCase } from './application/update-draft.use-case';
import { ApproveDraftUseCase } from './application/approve-draft.use-case';
import { UpdateDraftRequestDto } from './dto/update-draft-request.dto';

@Controller('campaign-contacts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutreachController {
  constructor(
    private readonly generateOutreachUseCase: GenerateOutreachUseCase,
    private readonly updateDraftUseCase: UpdateDraftUseCase,
    private readonly approveDraftUseCase: ApproveDraftUseCase,
  ) {}

  @Post(':id/generate-outreach')
  @HttpCode(HttpStatus.ACCEPTED)
  public async generateOutreach(
    @CurrentUser() user: { id: string },
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignContactId: string,
  ) {
    return this.generateOutreachUseCase.execute({
      userId: user.id,
      workspaceId: workspace.id,
      campaignContactId,
    });
  }

  @Patch(':id/draft')
  @HttpCode(HttpStatus.OK)
  public async updateDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignContactId: string,
    @Body() body: UpdateDraftRequestDto,
  ) {
    return this.updateDraftUseCase.execute({
      workspaceId: workspace.id,
      campaignContactId,
      subject: body.subject,
      bodyText: body.bodyText,
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  public async approveDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignContactId: string,
  ) {
    return this.approveDraftUseCase.execute({
      workspaceId: workspace.id,
      campaignContactId,
    });
  }
}
