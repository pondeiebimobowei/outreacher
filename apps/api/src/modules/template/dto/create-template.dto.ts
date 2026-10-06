import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TemplateStepInput {
  @IsNumber()
  sequence!: number;

  @IsString()
  @IsNotEmpty()
  subjectTemplate!: string;

  @IsString()
  @IsNotEmpty()
  bodyTemplate!: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateStepInput)
  steps!: TemplateStepInput[];
}
