import { IsEmail, IsEnum, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { SenderStatus } from '@repo/db';

export class UpdateSenderAccountDto {
  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsEnum(SenderStatus)
  status?: SenderStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  dailyLimit?: number;

  @IsOptional()
  @IsObject()
  sendingWindow?: any;
}
