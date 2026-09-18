import { z } from 'zod';
import { AIInvalidOutputException } from './ai-provider.interface';
import { OutreachContext } from './outreach-context.interface';

export const GeneratedOutreachDraftSchema = z.object({
  subject: z.string().min(3).max(150),
  body: z.string().min(20).max(4000),
});

export type GeneratedOutreachDraft = z.infer<
  typeof GeneratedOutreachDraftSchema
>;

export class OutreachValidator {
  private static readonly ILLEGAL_OPENING_CLAIMS =
    /\b(saw your (job|opening|listing|posting)|applying (for|to) the|open position|open role|hiring for)\b/i;

  public validate(
    rawText: string,
    context: OutreachContext,
  ): GeneratedOutreachDraft {
    // Stage 1 & 2: Parse raw text as JSON
    let parsedJson: unknown;
    try {
      // Clean possible markdown code block wrappers
      const cleanedText = rawText
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
      parsedJson = JSON.parse(cleanedText);
    } catch (error) {
      throw new AIInvalidOutputException(
        'AI completion output is not valid JSON',
        {
          rawText,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    // Stage 3: Zod Structural Validation
    const parseResult = GeneratedOutreachDraftSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      throw new AIInvalidOutputException(
        'AI draft failed structural validation schema',
        {
          issues: parseResult.error.issues,
        },
      );
    }

    const draft = parseResult.data;

    // Stage 4: Deterministic Zero-Fabrication Domain Validation
    if (context.opportunity.type !== 'CONFIRMED') {
      const fullText = `${draft.subject} ${draft.body}`;
      if (OutreachValidator.ILLEGAL_OPENING_CLAIMS.test(fullText)) {
        throw new AIInvalidOutputException(
          `AI draft contains illegal opening claim for non-confirmed opportunity (${context.opportunity.type})`,
          {
            opportunityType: context.opportunity.type,
            subject: draft.subject,
          },
        );
      }
    }

    return draft;
  }
}
