import { IsBoolean, IsOptional } from 'class-validator';

export class StartResearchDto {
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}
