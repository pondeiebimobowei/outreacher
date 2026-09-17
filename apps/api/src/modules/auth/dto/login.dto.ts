import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  email!: string;

  @IsString()
  password!: string;
}
