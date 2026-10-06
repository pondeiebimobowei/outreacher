import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { TemplateStepInput } from './create-template.dto';

export class SetTemplateStepsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateStepInput)
  steps!: TemplateStepInput[];
}
