import { OutreachReasonEvaluator } from './outreach-reason.evaluator';
import { OutreachContext } from './outreach-context.interface';

describe('OutreachReasonEvaluator', () => {
  let evaluator: OutreachReasonEvaluator;

  beforeEach(() => {
    evaluator = new OutreachReasonEvaluator();
  });

  const baseContext: OutreachContext = {
    workspaceId: 'ws-123',
    outreachId: 'outreach-123',
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

  it('evaluates CONFIRMED opportunity state with opportunity-specific supporting evidence correctly', () => {
    const context: OutreachContext = {
      ...baseContext,
      opportunity: {
        id: 'opp-1',
        type: 'CONFIRMED',
        roleTitle: 'Senior Staff Engineer',
        roleDescription: 'Leading core API architecture',
      },
      evidence: [
        {
          id: 'ev-1',
          opportunityId: 'opp-1',
          claim: 'Acme listed Senior Staff Engineer on careers portal',
          classification: 'FACT',
        },
      ],
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('CONFIRMED');
    expect(result.reasonText).toContain(
      'confirmed open role Senior Staff Engineer at Acme Corp',
    );
    expect(result.reasonText).toContain('verified opening evidence');
    expect(result.supportingEvidenceIds).toEqual(['ev-1']);
  });

  it('evaluates CONFIRMED opportunity state without supporting evidence without claiming verified opening evidence', () => {
    const context: OutreachContext = {
      ...baseContext,
      evidence: [],
      opportunity: {
        id: 'opp-1',
        type: 'CONFIRMED',
        roleTitle: 'Senior Staff Engineer',
      },
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('CONFIRMED');
    expect(result.reasonText).toContain(
      'confirmed open role Senior Staff Engineer at Acme Corp',
    );
    expect(result.reasonText).not.toContain('verified opening evidence');
    expect(result.supportingEvidenceIds).toEqual([]);
  });

  it('evaluates CONFIRMED opportunity with unrelated evidence WITHOUT claiming verified opening evidence', () => {
    const context: OutreachContext = {
      ...baseContext,
      opportunity: {
        id: 'opp-1',
        type: 'CONFIRMED',
        roleTitle: 'Senior Staff Engineer',
      },
      evidence: [
        {
          id: 'ev-unrelated',
          opportunityId: 'opp-unrelated', // Unrelated opportunity / general company fact
          claim: 'Acme expanded cloud footprint by 20%',
          classification: 'FACT',
        },
      ],
    };

    const result = evaluator.evaluate(context);
    expect(result.opportunityType).toBe('CONFIRMED');
    expect(result.reasonText).toContain(
      'confirmed open role Senior Staff Engineer at Acme Corp',
    );
    // Unrelated evidence MUST NOT cause "verified opening evidence" claim
    expect(result.reasonText).not.toContain('verified opening evidence');
    expect(result.supportingEvidenceIds).toEqual(['ev-unrelated']);
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
