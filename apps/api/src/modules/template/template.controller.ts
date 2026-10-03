import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { CreateTemplateUseCase } from './application/create-template.use-case';
import { ListTemplatesUseCase } from './application/list-templates.use-case';
import { GetTemplateUseCase } from './application/get-template.use-case';
import { UpdateTemplateUseCase } from './application/update-template.use-case';
import { SetTemplateStepsUseCase } from './application/set-template-steps.use-case';
import { DeleteTemplateUseCase } from './application/delete-template.use-case';
import { PreviewTemplateUseCase } from './application/preview-template.use-case';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SetTemplateStepsDto } from './dto/set-template-steps.dto';
import { PreviewTemplateDto } from './dto/preview-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class TemplateController {
  constructor(
    private readonly createTemplateUseCase: CreateTemplateUseCase,
    private readonly listTemplatesUseCase: ListTemplatesUseCase,
    private readonly getTemplateUseCase: GetTemplateUseCase,
    private readonly updateTemplateUseCase: UpdateTemplateUseCase,
    private readonly setTemplateStepsUseCase: SetTemplateStepsUseCase,
    private readonly deleteTemplateUseCase: DeleteTemplateUseCase,
    private readonly previewTemplateUseCase: PreviewTemplateUseCase,
  ) {}

  private getWorkspaceId(req: express.Request): string {
    const ws = (req as any).workspace;
    if (!ws?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return ws.id;
  }

  @Post()
  async createTemplate(@Req() req: express.Request, @Body() dto: CreateTemplateDto) {
    const workspaceId = this.getWorkspaceId(req);
    return this.createTemplateUseCase.execute(workspaceId, dto);
  }

  @Get()
  async listTemplates(
    @Req() req: express.Request,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const workspaceId = this.getWorkspaceId(req);
    const shouldInclude = includeArchived === 'true';
    return this.listTemplatesUseCase.execute(workspaceId, shouldInclude);
  }

  @Get(':id')
  async getTemplate(@Req() req: express.Request, @Param('id') id: string) {
    const workspaceId = this.getWorkspaceId(req);
    return this.getTemplateUseCase.execute(workspaceId, id);
  }

  @Patch(':id')
  async updateTemplate(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const workspaceId = this.getWorkspaceId(req);
    return this.updateTemplateUseCase.execute(workspaceId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Req() req: express.Request, @Param('id') id: string) {
    const workspaceId = this.getWorkspaceId(req);
    return this.deleteTemplateUseCase.execute(workspaceId, id);
  }

  @Put(':id/steps')
  async setTemplateSteps(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: SetTemplateStepsDto,
  ) {
    const workspaceId = this.getWorkspaceId(req);
    return this.setTemplateStepsUseCase.execute(workspaceId, id, dto);
  }

  @Post(':id/preview')
  async previewTemplate(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: PreviewTemplateDto,
  ) {
    const workspaceId = this.getWorkspaceId(req);
    return this.previewTemplateUseCase.execute(workspaceId, id, dto);
  }
}
