import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RecordUserOutcomeUseCase } from './application/record-user-outcome.use-case';
import { OutcomeController } from './outcome.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OutcomeController],
  providers: [RecordUserOutcomeUseCase],
  exports: [RecordUserOutcomeUseCase],
})
export class OutcomeModule {}
