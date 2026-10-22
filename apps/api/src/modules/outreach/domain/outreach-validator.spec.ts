import { OutreachValidator } from './outreach-validator';
import { OutreachContext } from './outreach-context.interface';
import { AIInvalidOutputException } from './ai-provider.interface';

describe('OutreachValidator', () => {
  let validator: OutreachValidator;

  beforeEach(() => {
    validator = new OutreachValidator();
  });

  const baseContext: OutreachContext = {
    workspaceId: 'ws-123',
    campaignMemberId: 'cc-123',
    person: { id: 'cnt-1', name: 'John Smith', kind: 'PERSON' },
    company: { id: 'cmp-1', name: 'Tech Inc' },
    opportunity: { type: 'PROACTIVE' },
    careerProfile: { targetRoles: ['Backend Engineer'], skills: ['Go'] },
    evidence: [],
  };

  it('validates and parses valid JSON draft for PROACTIVE opportunity', () => {
    const validJson = JSON.stringify({
      subject: 'Exploring technical alignment with Tech Inc',
      body: 'Hi John, I have been following Tech Inc work in backend architecture and wanted to share my background in Go systems engineering.',
    });

    const draft = validator.validate(validJson, baseContext);
    expect(draft.subject).toBe('Exploring technical alignment with Tech Inc');
    expect(draft.body).toContain('Hi John');
  });

  it('handles markdown code block wrapped JSON', () => {
    const markdownWrapped = `\`\`\`json
{
  "subject": "Engineering conversation",
  "body": "Hi John, I enjoyed reading about your platform engineering goals and wanted to connect."
}
\`\`\``;

    const draft = validator.validate(markdownWrapped, baseContext);
    expect(draft.subject).toBe('Engineering conversation');
  });

  it('throws AIInvalidOutputException on non-JSON output', () => {
    expect(() =>
      validator.validate('Not JSON text at all', baseContext),
    ).toThrow(AIInvalidOutputException);
  });

  it('throws AIInvalidOutputException on missing subject field', () => {
    const missingSubject = JSON.stringify({
      body: 'This body text is valid but subject is completely missing.',
    });

    expect(() => validator.validate(missingSubject, baseContext)).toThrow(
      AIInvalidOutputException,
    );
  });

  it('throws AIInvalidOutputException on subject/body length violations', () => {
    const shortBody = JSON.stringify({
      subject: 'Valid Subject',
      body: 'Too short',
    });

    expect(() => validator.validate(shortBody, baseContext)).toThrow(
      AIInvalidOutputException,
    );
  });

  it('rejects illegal opening claim for PROACTIVE opportunity (Zero-Fabrication rule)', () => {
    const illegalClaim = JSON.stringify({
      subject: 'Application for your Senior Engineer opening',
      body: 'Hi John, I saw your job posting for Senior Engineer and wanted to apply for the position.',
    });

    expect(() => validator.validate(illegalClaim, baseContext)).toThrow(
      AIInvalidOutputException,
    );
  });

  it('allows opening claims when opportunity is CONFIRMED', () => {
    const confirmedContext: OutreachContext = {
      ...baseContext,
      opportunity: { type: 'CONFIRMED', roleTitle: 'Senior Engineer' },
    };

    const openingClaim = JSON.stringify({
      subject: 'Regarding the Senior Engineer opening at Tech Inc',
      body: 'Hi John, I saw your job posting for Senior Engineer and would love to discuss my relevant experience.',
    });

    const draft = validator.validate(openingClaim, confirmedContext);
    expect(draft.subject).toContain('Senior Engineer opening');
  });
});
