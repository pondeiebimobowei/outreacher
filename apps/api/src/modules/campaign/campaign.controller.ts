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
import { CreateCampaignUseCase } from './application/create-campaign.use-case';
import { GetCampaignUseCase } from './application/get-campaign.use-case';
import { ListCampaignsUseCase } from './application/list-campaigns.use-case';
import { AddCampaignContactsUseCase } from './application/add-campaign-contacts.use-case';
import { ChangeCampaignStatusUseCase } from './application/change-campaign-status.use-case';
import { GetCampaignContactsUseCase } from './application/get-campaign-contacts.use-case';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { AddCampaignContactsDto } from './dto/add-campaign-contacts.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class CampaignController {
  constructor(
    private readonly createCampaignUseCase: CreateCampaignUseCase,
    private readonly getCampaignUseCase: GetCampaignUseCase,
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly addCampaignContactsUseCase: AddCampaignContactsUseCase,
    private readonly changeCampaignStatusUseCase: ChangeCampaignStatusUseCase,
    private readonly getCampaignContactsUseCase: GetCampaignContactsUseCase,
  ) {}

  @Post()
  public async createCampaign(
    @CurrentWorkspace() workspace: { id: string },
    @Body() dto: CreateCampaignDto,
  ) {
    return this.createCampaignUseCase.execute(workspace.id, dto);
  }

  @Get()
  public async listCampaigns(@CurrentWorkspace() workspace: { id: string }) {
    return this.listCampaignsUseCase.execute(workspace.id);
  }

  @Get(':id')
  public async getCampaign(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
  ) {
    return this.getCampaignUseCase.execute(workspace.id, id);
  }

  @Get(':id/contacts')
  public async getCampaignContacts(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
  ) {
    return this.getCampaignContactsUseCase.execute(workspace.id, id);
  }

  @Post(':id/contacts')
  @HttpCode(HttpStatus.OK)
  public async addContacts(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
    @Body() dto: AddCampaignContactsDto,
  ) {
    return this.addCampaignContactsUseCase.execute(workspace.id, id, dto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  public async pauseCampaign(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
  ) {
    return this.changeCampaignStatusUseCase.pause(workspace.id, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  public async resumeCampaign(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
  ) {
    return this.changeCampaignStatusUseCase.resume(workspace.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  public async archiveCampaign(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') id: string,
  ) {
    return this.changeCampaignStatusUseCase.archive(workspace.id, id);
  }
}
