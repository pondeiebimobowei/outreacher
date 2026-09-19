import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'atLeastOneField', async: false })
export class AtLeastOneFieldConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as UpdateDraftRequestDto;
    const hasSubject =
      typeof object.subject === 'string' && object.subject.length > 0;
    const hasBodyText =
      typeof object.bodyText === 'string' && object.bodyText.length > 0;
    return hasSubject || hasBodyText;
  }

  defaultMessage(): string {
    return 'At least one of subject or bodyText must be provided';
  }
}

export class UpdateDraftRequestDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 150)
  subject?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(20, 4000)
  bodyText?: string;

  @IsOptional()
  expectedUpdatedAt?: string;

  @Validate(AtLeastOneFieldConstraint)
  readonly _atLeastOneGuard?: boolean;
}
