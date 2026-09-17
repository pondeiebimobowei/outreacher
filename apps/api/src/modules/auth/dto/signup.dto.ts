import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}
