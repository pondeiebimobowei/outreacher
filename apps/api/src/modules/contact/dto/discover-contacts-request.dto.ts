import { IsBoolean, IsOptional } from 'class-validator';

export class DiscoverContactsRequestDto {
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}
