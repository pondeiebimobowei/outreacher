import { IsEmail, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSenderAccountDto {
  @IsString()
  @IsNotEmpty()
  integrationId!: string;

  @IsString()
  @IsNotEmpty()
  fromName!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  dailyLimit?: number;

  @IsOptional()
  @IsObject()
  sendingWindow?: any;
}
