import { ContactRelevanceEvaluator } from './contact-relevance.evaluator';

describe('ContactRelevanceEvaluator', () => {
  it('evaluates ROLE_ADDRESS as LOW relevance', () => {
    const res = ContactRelevanceEvaluator.evaluate({
      contactKind: 'ROLE_ADDRESS',
      email: 'careers@acme.com',
    });
    expect(res.relevance).toBe('LOW');
    expect(res.recommendationRationale).toContain('Role address');
  });

  it('evaluates target role match as HIGH relevance', () => {
    const res = ContactRelevanceEvaluator.evaluate({
      contactKind: 'PERSON',
      title: 'Senior Backend Engineer',
      targetRoles: ['Backend Engineer'],
    });
    expect(res.relevance).toBe('HIGH');
    expect(res.recommendationRationale).toContain(
      "matches your target role 'Backend Engineer'",
    );
  });

  it('boosts relevance to HIGH for confirmed opportunity alignment', () => {
    const res = ContactRelevanceEvaluator.evaluate({
      contactKind: 'PERSON',
      title: 'Engineering Manager',
      confirmedOpportunityTitles: ['Engineering Lead'],
    });
    expect(res.relevance).toBe('HIGH');
    expect(res.recommendationRationale).toContain(
      "aligns with confirmed opening 'Engineering Lead'",
    );
  });

  it('evaluates general department match as MEDIUM relevance', () => {
    const res = ContactRelevanceEvaluator.evaluate({
      contactKind: 'PERSON',
      title: 'Software Developer',
      targetRoles: ['DevOps Manager'],
    });
    expect(res.relevance).toBe('MEDIUM');
    expect(res.recommendationRationale).toContain('target department');
  });
});
