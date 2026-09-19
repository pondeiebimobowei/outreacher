import { IsArray, IsString } from 'class-validator';

export class AssignSendersDto {
  @IsArray()
  @IsString({ each: true })
  senderAccountIds!: string[];
}
