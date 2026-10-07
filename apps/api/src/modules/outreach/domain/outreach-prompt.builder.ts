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
2. Zero Fabrication Policy: Do NOT invent company facts, achievements, job openings, team growth, funding, or metrics that are not explicitly supported by the provided context and evidence.
3. If the opportunity type is PROACTIVE or UNCLASSIFIED, you MUST NOT claim or imply that an open job posting exists (do NOT say "saw your job posting", "applying for the role", "noticed your open role", "hiring for", etc.).
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
Name: ${context.person.firstName} ${context.person.lastName}
Title: ${context.person.title || 'N/A'}

### OPPORTUNITY CLASSIFICATION
Opportunity Type: ${context.opportunity.type}
Role Title: ${context.opportunity.roleTitle || 'N/A'}

### OUTREACH REASON (GROUNDED NARRATIVE)
${reasonResult.reasonText}

### SUPPORTING EVIDENCE
${
  context.evidence.length > 0
    ? context.evidence
        .map((e) => {
          const parts = [`- [${e.classification}] ${e.claim}`];
          if (e.sourceName) parts.push(`Source: ${e.sourceName}`);
          if (e.sourceUrl) parts.push(`URL: ${e.sourceUrl}`);
          if (e.sourceExcerpt) parts.push(`Excerpt: "${e.sourceExcerpt}"`);
          return parts.join(' | ');
        })
        .join('\n')
    : 'No explicit evidence items attached.'
}

Generate the initial outreach email draft matching the specified JSON schema.`;

    return { systemPrompt, userPrompt };
  }
}
