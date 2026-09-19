import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { toIntegrationResponse } from './dto/integration-response.dto';
import { CreateIntegrationUseCase } from './application/create-integration.use-case';
import { ListIntegrationsUseCase } from './application/list-integrations.use-case';
import { GetIntegrationUseCase } from './application/get-integration.use-case';
import { TestIntegrationUseCase } from './application/test-integration.use-case';
import { EnableIntegrationUseCase } from './application/enable-integration.use-case';
import { DisableIntegrationUseCase } from './application/disable-integration.use-case';

@Controller('integrations')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class IntegrationController {
  constructor(
    private readonly createIntegration: CreateIntegrationUseCase,
    private readonly listIntegrations: ListIntegrationsUseCase,
    private readonly getIntegration: GetIntegrationUseCase,
    private readonly testIntegration: TestIntegrationUseCase,
    private readonly enableIntegration: EnableIntegrationUseCase,
    private readonly disableIntegration: DisableIntegrationUseCase,
  ) {}

  @Post()
  public async create(
    @CurrentWorkspace() workspace: { id: string },
    @Body() dto: CreateIntegrationDto,
  ) {
    const integration = await this.createIntegration.execute(workspace.id, dto);
    return toIntegrationResponse(integration);
  }

  @Get()
  public async list(@CurrentWorkspace() workspace: { id: string }) {
    const integrations = await this.listIntegrations.execute(workspace.id);
    return integrations.map(toIntegrationResponse);
  }

  @Get(':id')
  public async get(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') integrationId: string,
  ) {
    const integration = await this.getIntegration.execute(workspace.id, integrationId);
    return toIntegrationResponse(integration);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  public async test(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') integrationId: string,
  ) {
    return this.testIntegration.execute(workspace.id, integrationId);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  public async enable(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') integrationId: string,
  ) {
    return this.enableIntegration.execute(workspace.id, integrationId);
  }

  @Patch(':id/disable')
  public async disable(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') integrationId: string,
  ) {
    const integration = await this.disableIntegration.execute(workspace.id, integrationId);
    return toIntegrationResponse(integration);
  }
}
