import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { AssignSendersDto } from './dto/assign-senders.dto';
import { AssignCampaignSendersUseCase } from './application/assign-campaign-senders.use-case';
import { ListCampaignSendersUseCase } from './application/list-campaign-senders.use-case';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class CampaignSenderController {
  constructor(
    private readonly assignUseCase: AssignCampaignSendersUseCase,
    private readonly listUseCase: ListCampaignSendersUseCase,
  ) {}

  @Get(':campaignId/senders')
  public async list(
    @CurrentWorkspace() workspace: { id: string },
    @Param('campaignId') campaignId: string,
  ) {
    return this.listUseCase.execute(workspace.id, campaignId);
  }

  @Post(':campaignId/senders')
  @HttpCode(HttpStatus.OK)
  public async assign(
    @CurrentWorkspace() workspace: { id: string },
    @Param('campaignId') campaignId: string,
    @Body() dto: AssignSendersDto,
  ) {
    return this.assignUseCase.execute(workspace.id, campaignId, dto);
  }
}
