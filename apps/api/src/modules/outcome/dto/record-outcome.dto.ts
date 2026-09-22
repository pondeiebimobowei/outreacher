import { OutcomeType } from '@repo/db';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class RecordOutcomeDto {
  @IsEnum(OutcomeType)
  outcomeType!: OutcomeType;

  @IsOptional()
  @IsString()
  notes?: string;
}
