import { OutreachContext } from './outreach-context.interface';
import { OutreachReasonResult } from './outreach-reason.evaluator';

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export class OutreachPromptBuilder {
  public static build(
    context: OutreachContext,
    reasonResult: OutreachReasonResult,
  ): BuiltPrompt {
    const systemPrompt = `You are an AI assistant generating high-quality, professional, evidence-backed career outreach email drafts for users seeking software engineering and technical roles.

STRICT INVARIANTS:
1. You MUST output ONLY a valid JSON object matching this exact schema:
{
  "subject": "Email subject line (3-150 characters)",
  "body": "Email body text (20-4000 characters)"
}
2. Zero Fabrication Policy: Do NOT invent company facts, achievements, job openings, or metrics that are not supported by the provided context.
3. If the opportunity type is PROACTIVE or UNCLASSIFIED, you MUST NOT claim or imply that an open job posting exists (do NOT say "saw your job posting", "applying for the role", etc.).
4. Focus on professional alignment, relevant technical skills, and grounded evidence.
5. Do NOT include markdown formatting outside the JSON code block.`;

    const userPrompt = `### USER CAREER PROFILE
Headline: ${context.careerProfile.headline || 'N/A'}
Summary: ${context.careerProfile.summary || 'N/A'}
Target Roles: ${context.careerProfile.targetRoles.join(', ') || 'N/A'}
Skills: ${context.careerProfile.skills.join(', ') || 'N/A'}

### TARGET COMPANY
Company Name: ${context.company.name}
Industry: ${context.company.industry || 'N/A'}
Description: ${context.company.description || 'N/A'}

### TARGET CONTACT
Name: ${context.contact.name}
Title: ${context.contact.title || 'N/A'}

### OPPORTUNITY CLASSIFICATION
Opportunity Type: ${context.opportunity.type}
Role Title: ${context.opportunity.roleTitle || 'N/A'}

### OUTREACH REASON (GROUNDED NARRATIVE)
${reasonResult.reasonText}

### SUPPORTING EVIDENCE
${
  context.evidence.length > 0
    ? context.evidence
        .map(
          (e) =>
            `- [${e.classification}] ${e.claim} (Source: ${e.sourceName || 'Unknown'})`,
        )
        .join('\n')
    : 'No explicit evidence items attached.'
}

Generate the initial outreach email draft matching the specified JSON schema.`;

    return { systemPrompt, userPrompt };
  }
}
