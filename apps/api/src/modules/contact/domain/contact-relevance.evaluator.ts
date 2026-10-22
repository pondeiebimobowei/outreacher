export interface ContactEvaluationInput {
  title?: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  email?: string | null;
  targetRoles?: string[];
  confirmedOpportunityTitles?: string[];
}

export interface ContactEvaluationResult {
  relevance: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendationRationale: string;
}

export class ContactRelevanceEvaluator {
  static evaluate(input: ContactEvaluationInput): ContactEvaluationResult {
    const {
      title,
      personKind,
      email,
      targetRoles = [],
      confirmedOpportunityTitles = [],
    } = input;
    const cleanTitle = (title || '').trim();
    const normalizedTitle = cleanTitle.toLowerCase();

    // 1. Role Address Handling
    if (personKind === 'ROLE_ADDRESS') {
      return {
        relevance: 'LOW',
        recommendationRationale: `Role address '${email || 'general'}' for general department inquiries.`,
      };
    }

    if (!cleanTitle) {
      return {
        relevance: 'LOW',
        recommendationRationale:
          'Person has no specified job title for relevance evaluation.',
      };
    }

    // 2. Confirmed Opportunity Match
    const matchingConfirmedOpp = confirmedOpportunityTitles.find((oppTitle) => {
      const normalizedOpp = oppTitle.toLowerCase();
      return (
        normalizedTitle.includes(normalizedOpp) ||
        normalizedOpp.includes(normalizedTitle) ||
        this.shareKeywords(normalizedTitle, normalizedOpp)
      );
    });

    if (matchingConfirmedOpp) {
      return {
        relevance: 'HIGH',
        recommendationRationale: `Role '${cleanTitle}' directly aligns with confirmed opening '${matchingConfirmedOpp}' and target role requirements.`,
      };
    }

    // 3. Target Role Direct Keyword Match
    const matchedTargetRole = targetRoles.find((tr) => {
      const normalizedTr = tr.toLowerCase();
      return (
        normalizedTitle.includes(normalizedTr) ||
        normalizedTr.includes(normalizedTitle) ||
        this.shareKeywords(normalizedTitle, normalizedTr)
      );
    });

    if (matchedTargetRole) {
      return {
        relevance: 'HIGH',
        recommendationRationale: `Role '${cleanTitle}' directly matches your target role '${matchedTargetRole}'.`,
      };
    }

    // 4. Decision Maker / Leadership / Talent Acquisition Keywords
    const decisionMakerKeywords = [
      'vp',
      'vice president',
      'director',
      'head of',
      'lead',
      'manager',
      'chief',
      'talent',
      'recruiter',
      'engineering manager',
    ];
    const isDecisionMaker = decisionMakerKeywords.some((kw) =>
      normalizedTitle.includes(kw),
    );

    if (isDecisionMaker) {
      return {
        relevance: 'HIGH',
        recommendationRationale: `Functional decision-maker role '${cleanTitle}' appropriate for career outreach.`,
      };
    }

    // 5. Broad Department Match
    const departmentKeywords = [
      'engineering',
      'software',
      'product',
      'tech',
      'data',
      'design',
      'people',
      'hr',
    ];
    const isDeptMatch = departmentKeywords.some((kw) =>
      normalizedTitle.includes(kw),
    );

    if (isDeptMatch) {
      return {
        relevance: 'MEDIUM',
        recommendationRationale: `Role '${cleanTitle}' belongs to target department for proactive outreach.`,
      };
    }

    // 6. Default Fallback
    return {
      relevance: 'LOW',
      recommendationRationale: `Role '${cleanTitle}' has limited direct alignment with target roles.`,
    };
  }

  private static shareKeywords(str1: string, str2: string): boolean {
    const words1 = str1.split(/\s+/).filter((w) => w.length > 3);
    const words2 = str2.split(/\s+/).filter((w) => w.length > 3);
    return words1.some((w1) => words2.includes(w1));
  }
}
