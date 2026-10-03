export interface TemplateStepInput {
  sequence: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

export class CreateTemplateDto {
  name!: string;
  steps!: TemplateStepInput[];
}
