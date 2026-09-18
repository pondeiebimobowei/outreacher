import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';

export class AddCampaignContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  contactIds!: string[];
}
