import { IsEnum, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { IntegrationProvider } from '@repo/db';

export class CreateIntegrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsEnum(IntegrationProvider)
  provider!: IntegrationProvider;

  @IsString()
  @IsNotEmpty()
  @Matches(/^env:\/\/[A-Z0-9_]+$/, {
    message: 'secretReference must be an environment variable reference starting with env:// (e.g. env://RESEND_API_KEY)',
  })
  secretReference!: string;
}
