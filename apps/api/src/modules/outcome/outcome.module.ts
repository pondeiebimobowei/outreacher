import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordUserOutcomeUseCase } from './application/record-user-outcome.use-case';
import { OutcomeController } from './outcome.controller';
import { WorkspaceModule } from '../workspaces/workspace.module';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [OutcomeController],
  providers: [RecordUserOutcomeUseCase],
  exports: [RecordUserOutcomeUseCase],
})
export class OutcomeModule {}
