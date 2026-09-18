import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import express from 'express';
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { RequestWorkspace } from '../../types/express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CreateContactUseCase } from './application/create-contact.use-case';
import { DiscoverContactsUseCase } from './application/discover-contacts.use-case';
import { GetCompanyContactsUseCase } from './application/get-company-contacts.use-case';
import { GetContactByIdUseCase } from './application/get-contact-by-id.use-case';
import { SelectContactUseCase } from './application/select-contact.use-case';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { DiscoverContactsRequestDto } from './dto/discover-contacts-request.dto';

@Controller()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ContactController {
  constructor(
    private readonly createContactUseCase: CreateContactUseCase,
    private readonly discoverContactsUseCase: DiscoverContactsUseCase,
    private readonly getCompanyContactsUseCase: GetCompanyContactsUseCase,
    private readonly getContactByIdUseCase: GetContactByIdUseCase,
    private readonly selectContactUseCase: SelectContactUseCase,
  ) {}

  @Post('companies/:companyId/contacts')
  async createContact(
    @Req() req: express.Request,
    @Param('companyId') companyId: string,
    @Body() dto: CreateContactRequestDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.createContactUseCase.execute(workspace.id, companyId, dto);
  }

  @Post('companies/:companyId/contacts/discover')
  async discoverContacts(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
    @Param('companyId') companyId: string,
    @Body() dto?: DiscoverContactsRequestDto,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    const result = await this.discoverContactsUseCase.execute(
      workspace.id,
      companyId,
      dto,
    );
    res.status(result.reused ? 200 : 202);
    return result;
  }

  @Get('companies/:companyId/contacts')
  async getCompanyContacts(
    @Req() req: express.Request,
    @Param('companyId') companyId: string,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.getCompanyContactsUseCase.execute(workspace.id, companyId);
  }

  @Get('contacts/:id')
  async getContactById(
    @Req() req: express.Request,
    @Param('id') contactId: string,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.getContactByIdUseCase.execute(workspace.id, contactId);
  }

  @Post('companies/:companyId/contacts/:contactId/select')
  async selectContact(
    @Req() req: express.Request,
    @Param('companyId') companyId: string,
    @Param('contactId') contactId: string,
  ) {
    const workspace = req.workspace as RequestWorkspace;
    if (!workspace?.id) {
      throw new AppUnauthorizedException('Workspace context is missing.');
    }
    return this.selectContactUseCase.execute(
      workspace.id,
      companyId,
      contactId,
    );
  }
}
