import { IsOptional } from 'class-validator';

export class ApproveDraftRequestDto {
  @IsOptional()
  expectedUpdatedAt?: string;
}
