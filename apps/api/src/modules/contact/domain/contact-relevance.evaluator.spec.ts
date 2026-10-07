import { ContactRelevanceEvaluator } from './contact-relevance.evaluator';

describe('ContactRelevanceEvaluator', () => {
  describe('Dimension Independence & Safety Invariants', () => {
    it('evaluates ROLE_ADDRESS as LOW relevance regardless of email or title', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'ROLE_ADDRESS',
        email: 'careers@acme.com',
        title: 'Head of Recruiting',
        targetRoles: ['Recruiting Lead'],
      });
      expect(res.relevance).toBe('LOW');
      expect(res.recommendationRationale).toContain("Role address 'careers@acme.com'");
    });

    it('evaluates missing or blank title as LOW relevance', () => {
      const resNull = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: null,
        targetRoles: ['Backend Engineer'],
      });
      expect(resNull.relevance).toBe('LOW');
      expect(resNull.recommendationRationale).toBe(
        'Person has no specified job title for relevance evaluation.',
      );

      const resEmpty = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: '   ',
        targetRoles: ['Backend Engineer'],
      });
      expect(resEmpty.relevance).toBe('LOW');
      expect(resEmpty.recommendationRationale).toBe(
        'Person has no specified job title for relevance evaluation.',
      );
    });

    it('does NOT degrade relevance when email is null or unavailable (dimension independence)', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Staff Backend Engineer',
        email: null,
        targetRoles: ['Backend Engineer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain("matches your target role 'Backend Engineer'");
    });
  });

  describe('Precedence Order & Alignment Matching', () => {
    it('precedence 1: confirmed opportunity match yields HIGH relevance and references opening', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Founding Engineer',
        confirmedOpportunityTitles: ['Founding Engineer'],
        targetRoles: ['Product Manager'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain(
        "aligns with confirmed opening 'Founding Engineer'",
      );
    });

    it('precedence 2: target role token/phrase match yields HIGH relevance and references target role', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Senior Backend Engineer',
        targetRoles: ['Backend Engineer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain(
        "matches your target role 'Backend Engineer'",
      );
    });

    it('matches target role across case, punctuation, and extra prefixes', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Lead Software Engineer, Core Services',
        targetRoles: ['Software Engineer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain(
        "matches your target role 'Software Engineer'",
      );
    });

    it('precedence 3: leadership/decision-maker in target domain with target context yields HIGH relevance', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'VP of Engineering',
        targetRoles: ['Backend Engineer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain(
        "Functional decision-maker role 'VP of Engineering'",
      );
    });

    it('evaluates recruiter/talent acquisition with target context as HIGH relevance', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Technical Recruiter',
        targetRoles: ['Fullstack Developer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain(
        "Functional decision-maker role 'Technical Recruiter'",
      );
    });

    it('INVARIANT: in the absence of target roles and confirmed opportunities, generic leadership keywords produce at most MEDIUM', () => {
      const resMgr = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Engineering Manager',
        targetRoles: [],
        confirmedOpportunityTitles: [],
      });
      expect(resMgr.relevance).toBe('MEDIUM');
      expect(resMgr.recommendationRationale).toContain('leadership');

      const resVp = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'VP of Technology',
      });
      expect(resVp.relevance).toBe('MEDIUM');
      expect(resVp.recommendationRationale).toContain('leadership');
    });

    it('evaluates leadership outside direct target domain as MEDIUM', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Director of Marketing',
        targetRoles: ['Backend Engineer'],
      });
      expect(res.relevance).toBe('MEDIUM');
      expect(res.recommendationRationale).toContain('outside direct target function');
    });

    it('precedence 4: department alignment yields MEDIUM relevance and references department', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Software Developer',
        targetRoles: ['DevOps Manager'],
      });
      expect(res.relevance).toBe('MEDIUM');
      expect(res.recommendationRationale).toContain('target department');
    });

    it('precedence 5: unrelated role without alignment yields LOW relevance', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Office Manager',
        targetRoles: ['Backend Engineer'],
      });
      expect(res.relevance).toBe('LOW');
      expect(res.recommendationRationale).toContain('limited direct alignment');
    });

    it('does not produce false-positive substring matches on partial words', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'Underdeveloped Property Specialist',
        targetRoles: ['Developer'],
      });
      // 'Developer' must not match 'underdeveloped'
      expect(res.relevance).toBe('LOW');
    });

    it('handles uppercase titles, punctuation, and compound target roles cleanly', () => {
      const res = ContactRelevanceEvaluator.evaluate({
        personKind: 'PERSON',
        title: 'VP OF ENGINEERING, INFRASTRUCTURE & CLOUD',
        targetRoles: ['Senior Cloud Engineer'],
      });
      expect(res.relevance).toBe('HIGH');
      expect(res.recommendationRationale).toContain('VP OF ENGINEERING, INFRASTRUCTURE & CLOUD');
    });
  });
});


