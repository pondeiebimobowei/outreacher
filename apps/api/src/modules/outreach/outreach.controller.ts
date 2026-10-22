import {
  Controller,
  Get,
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
import { GetCampaignContactUseCase } from './application/get-campaign-contact.use-case';
import { UpdateDraftRequestDto } from './dto/update-draft-request.dto';
import { ApproveDraftRequestDto } from './dto/approve-draft-request.dto';

@Controller('campaign-contacts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutreachController {
  constructor(
    private readonly generateOutreachUseCase: GenerateOutreachUseCase,
    private readonly updateDraftUseCase: UpdateDraftUseCase,
    private readonly approveDraftUseCase: ApproveDraftUseCase,
    private readonly getCampaignContactUseCase: GetCampaignContactUseCase,
  ) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  public async getCampaignContact(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignMemberId: string,
  ) {
    return this.getCampaignContactUseCase.execute({
      workspaceId: workspace.id,
      campaignMemberId,
    });
  }

  @Post(':id/generate-outreach')
  @HttpCode(HttpStatus.ACCEPTED)
  public async generateOutreach(
    @CurrentUser() user: { id: string },
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignMemberId: string,
  ) {
    return this.generateOutreachUseCase.execute({
      userId: user.id,
      workspaceId: workspace.id,
      campaignMemberId,
    });
  }

  @Patch(':id/draft')
  @HttpCode(HttpStatus.OK)
  public async updateDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignMemberId: string,
    @Body() body: UpdateDraftRequestDto,
  ) {
    return this.updateDraftUseCase.execute({
      workspaceId: workspace.id,
      campaignMemberId,
      subject: body.subject,
      bodyText: body.bodyText,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  public async approveDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignMemberId: string,
    @Body() body?: ApproveDraftRequestDto,
  ) {
    return this.approveDraftUseCase.execute({
      workspaceId: workspace.id,
      campaignMemberId,
      expectedUpdatedAt: body?.expectedUpdatedAt,
    });
  }
}
