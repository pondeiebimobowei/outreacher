import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import express from 'express';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { RequestWorkspace } from '../../types/express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCompanyUseCase } from './application/create-company.use-case';
import { GetCompanyUseCase } from './application/get-company.use-case';
import { ListCompaniesUseCase } from './application/list-companies.use-case';
import { UpdateCompanyUseCase } from './application/update-company.use-case';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(
    private readonly createCompanyUseCase: CreateCompanyUseCase,
    private readonly listCompaniesUseCase: ListCompaniesUseCase,
    private readonly getCompanyUseCase: GetCompanyUseCase,
    private readonly updateCompanyUseCase: UpdateCompanyUseCase,
  ) {}

  @Post()
  async createCompany(
    @Req() req: express.Request,
    @Body() dto: CreateCompanyDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.createCompanyUseCase.execute(workspace.id, dto);
  }

  @Get()
  async listCompanies(@Req() req: express.Request) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.listCompaniesUseCase.execute(workspace.id);
  }

  @Get(':id')
  async getCompany(@Req() req: express.Request, @Param('id') id: string) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.getCompanyUseCase.execute(workspace.id, id);
  }

  @Patch(':id')
  async updateCompany(
    @Req() req: express.Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.updateCompanyUseCase.execute(workspace.id, id, dto);
  }
}
