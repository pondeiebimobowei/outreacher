import { OutreachReasonEvaluator } from './outreach-reason.evaluator';
import { OutreachContext } from './outreach-context.interface';

describe('OutreachReasonEvaluator', () => {
  let evaluator: OutreachReasonEvaluator;

  beforeEach(() => {
    evaluator = new OutreachReasonEvaluator();
  });

  const baseContext: OutreachContext = {
    workspaceId: 'ws-123',
    campaignMemberId: 'cc-123',
    person: {
      id: 'cnt-1',
      firstName: 'Jane',
      lastName: 'Doe',
      title: 'VP of Engineering',
      kind: 'PERSON',
    },
    company: {
      id: 'cmp-1',
      name: 'Acme Corp',
      domain: 'acme.com',
      industry: 'Software',
      description: 'Building cloud tools',
    },
    opportunity: {
      type: 'PROACTIVE',
      roleTitle: 'Senior Backend Engineer',
    },
    careerProfile: {
      headline: 'Full Stack Dev',
      targetRoles: ['Backend Engineer'],
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    },
    evidence: [
      {
        id: 'ev-1',
        claim: 'Acme expanding cloud team',
        classification: 'FACT',
      },
    ],
  };

  it('evaluates CONFIRMED opportunity state correctly', () => {
    const context: OutreachContext = {
      ...baseContext,
      opportunity: {
        type: 'CONFIRMED',
        roleTitle: 'Senior Staff Engineer',
        roleDescription: 'Leading core API architecture',
      },
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('CONFIRMED');
    expect(result.reasonText).toContain(
      'confirmed open role Senior Staff Engineer at Acme Corp',
    );
    expect(result.reasonText).toContain('verified opening evidence');
    expect(result.supportingEvidenceIds).toEqual(['ev-1']);
  });

  it('evaluates PROACTIVE opportunity state without claiming open position', () => {
    const context: OutreachContext = {
      ...baseContext,
      opportunity: {
        type: 'PROACTIVE',
      },
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('PROACTIVE');
    expect(result.reasonText).toContain('Proactive outreach to Jane Doe');
    expect(result.reasonText).toContain('No open job posting is claimed');
    expect(result.reasonText).not.toContain('confirmed open role');
  });

  it('evaluates UNCLASSIFIED opportunity state without hiring claims', () => {
    const context: OutreachContext = {
      ...baseContext,
      opportunity: {
        type: 'UNCLASSIFIED',
      },
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('UNCLASSIFIED');
    expect(result.reasonText).toContain(
      'Exploring general engineering fit with Jane Doe',
    );
    expect(result.reasonText).toContain('without hiring assertions');
    expect(result.reasonText).not.toContain('job posting');
  });
});
