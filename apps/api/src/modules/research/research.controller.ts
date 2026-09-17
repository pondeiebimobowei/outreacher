import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { RequestWorkspace } from '../../types/express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { GetCompanyResearchUseCase } from './application/get-company-research.use-case';
import { StartCompanyResearchUseCase } from './application/start-company-research.use-case';
import { StartResearchDto } from './dto/start-research.dto';

@Controller('companies/:companyId/research')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ResearchController {
  constructor(
    private readonly startCompanyResearchUseCase: StartCompanyResearchUseCase,
    private readonly getCompanyResearchUseCase: GetCompanyResearchUseCase,
  ) {}

  @Post()
  async startResearch(
    @Req() req: express.Request,
    @Param('companyId') companyId: string,
    @Body() dto: StartResearchDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.startCompanyResearchUseCase.execute(
      workspace.id,
      companyId,
      dto,
    );
  }

  @Get()
  async getResearch(
    @Req() req: express.Request,
    @Param('companyId') companyId: string,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.getCompanyResearchUseCase.execute(workspace.id, companyId);
  }
}
