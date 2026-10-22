import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class CreateContactRequestDto {
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
  personKind?: 'PERSON' | 'ROLE_ADDRESS';

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  sourceUrl?: string | null;
}
