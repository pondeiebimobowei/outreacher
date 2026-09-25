import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import type { CreateContactRequest, PersonKind } from '@repo/shared';

export class CreateContactRequestDto implements CreateContactRequest {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsEnum(['PERSON', 'ROLE_ADDRESS'])
  personKind?: PersonKind;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  sourceUrl?: string | null;
}
