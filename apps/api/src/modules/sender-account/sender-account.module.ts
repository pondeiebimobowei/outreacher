import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { CreateSenderAccountUseCase } from './application/create-sender-account.use-case';
import { UpdateSenderAccountUseCase } from './application/update-sender-account.use-case';
import { GetSenderAccountUseCase } from './application/get-sender-account.use-case';
import { ListSenderAccountsUseCase } from './application/list-sender-accounts.use-case';
import { SenderAccountController } from './sender-account.controller';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [SenderAccountController],
  providers: [
    CreateSenderAccountUseCase,
    UpdateSenderAccountUseCase,
    GetSenderAccountUseCase,
    ListSenderAccountsUseCase,
  ],
})
export class SenderAccountModule {}
