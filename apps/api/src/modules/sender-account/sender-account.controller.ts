import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { CreateSenderAccountDto } from './dto/create-sender-account.dto';
import { UpdateSenderAccountDto } from './dto/update-sender-account.dto';
import { CreateSenderAccountUseCase } from './application/create-sender-account.use-case';
import { UpdateSenderAccountUseCase } from './application/update-sender-account.use-case';
import { GetSenderAccountUseCase } from './application/get-sender-account.use-case';
import { ListSenderAccountsUseCase } from './application/list-sender-accounts.use-case';

@Controller('sender-accounts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class SenderAccountController {
  constructor(
    private readonly createUseCase: CreateSenderAccountUseCase,
    private readonly updateUseCase: UpdateSenderAccountUseCase,
    private readonly getUseCase: GetSenderAccountUseCase,
    private readonly listUseCase: ListSenderAccountsUseCase,
  ) {}

  @Post()
  public async create(
    @CurrentWorkspace() workspace: { id: string },
    @Body() dto: CreateSenderAccountDto,
  ) {
    return this.createUseCase.execute(workspace.id, dto);
  }

  @Get()
  public async list(@CurrentWorkspace() workspace: { id: string }) {
    return this.listUseCase.execute(workspace.id);
  }

  @Get(':id')
  public async get(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') senderAccountId: string,
  ) {
    return this.getUseCase.execute(workspace.id, senderAccountId);
  }

  @Patch(':id')
  public async update(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') senderAccountId: string,
    @Body() dto: UpdateSenderAccountDto,
  ) {
    return this.updateUseCase.execute(workspace.id, senderAccountId, dto);
  }
}
