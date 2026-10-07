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

const STOPWORDS = new Set([
  'of',
  'the',
  'and',
  'for',
  'at',
  'in',
  'a',
  'an',
  'to',
  'with',
  'on',
  'by',
  'from',
]);

const TECH_ENGINEERING_DOMAIN = new Set([
  'engineer',
  'engineering',
  'software',
  'tech',
  'technology',
  'developer',
  'backend',
  'frontend',
  'fullstack',
  'data',
  'devops',
  'infrastructure',
  'system',
  'systems',
  'architecture',
  'architect',
  'platform',
]);

const PRODUCT_DOMAIN = new Set(['product', 'ux', 'ui', 'design', 'designer']);
const MARKETING_DOMAIN = new Set(['marketing', 'growth', 'brand', 'content']);
const SALES_DOMAIN = new Set(['sales', 'account', 'revenue', 'business development']);

const EXECUTIVE_OR_LEADERSHIP_TITLES = [
  'vp',
  'vice president',
  'director',
  'head of',
  'chief',
  'cto',
  'cpo',
  'ceo',
  'coo',
  'cio',
  'ciso',
];

const SPECIFIC_LEADERSHIP_ROLES = [
  'engineering manager',
  'product manager',
  'tech lead',
  'team lead',
  'hiring manager',
  'lead software engineer',
  'lead engineer',
  'lead developer',
];

const TALENT_ROLES = [
  'recruiter',
  'talent',
  'talent acquisition',
  'sourcer',
  'headhunter',
];

const DEPARTMENT_KEYWORDS = [
  'engineering',
  'software',
  'product',
  'tech',
  'technology',
  'developer',
  'data',
  'design',
  'people',
  'hr',
  'operations',
  'infrastructure',
];

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

    // 1. Role Address Handling (Always LOW)
    if (personKind === 'ROLE_ADDRESS') {
      return {
        relevance: 'LOW',
        recommendationRationale: `Role address '${email || 'general'}' for general department inquiries.`,
      };
    }

    // 2. Missing Job Title (Always LOW)
    if (!cleanTitle) {
      return {
        relevance: 'LOW',
        recommendationRationale:
          'Person has no specified job title for relevance evaluation.',
      };
    }

    const titleTokens = this.tokenize(cleanTitle);

    // 3. Confirmed Opportunity Match (Precedence 1 -> HIGH)
    const matchingConfirmedOpp = confirmedOpportunityTitles.find((oppTitle) =>
      this.matchesRole(cleanTitle, oppTitle),
    );

    if (matchingConfirmedOpp) {
      return {
        relevance: 'HIGH',
        recommendationRationale: `Role '${cleanTitle}' directly aligns with confirmed opening '${matchingConfirmedOpp}' and target role requirements.`,
      };
    }

    // 4. Target Role Direct Keyword / Phrase Match (Precedence 2 -> HIGH)
    const matchedTargetRole = targetRoles.find((tr) =>
      this.matchesRole(cleanTitle, tr),
    );

    if (matchedTargetRole) {
      return {
        relevance: 'HIGH',
        recommendationRationale: `Role '${cleanTitle}' directly matches your target role '${matchedTargetRole}'.`,
      };
    }

    // 5. Decision Maker / Leadership / Talent Acquisition (Precedence 3)
    const isTalent = this.matchesAnyPattern(cleanTitle, TALENT_ROLES);
    const isExecOrLeadership = this.matchesAnyPattern(
      cleanTitle,
      EXECUTIVE_OR_LEADERSHIP_TITLES,
    );
    const isSpecificLeadership = this.matchesAnyPattern(
      cleanTitle,
      SPECIFIC_LEADERSHIP_ROLES,
    );
    const isLeadershipCandidate =
      isTalent || isExecOrLeadership || isSpecificLeadership;

    const hasTargetContext =
      targetRoles.length > 0 || confirmedOpportunityTitles.length > 0;

    if (isLeadershipCandidate) {
      // INVARIANT: In the absence of target roles and confirmed opportunities,
      // generic leadership keywords produce at most MEDIUM.
      if (!hasTargetContext) {
        return {
          relevance: 'MEDIUM',
          recommendationRationale: `Functional leadership role '${cleanTitle}' appropriate for career outreach.`,
        };
      }

      // In the presence of target context:
      // Talent & recruiters match across all roles
      if (isTalent) {
        return {
          relevance: 'HIGH',
          recommendationRationale: `Functional decision-maker role '${cleanTitle}' appropriate for career outreach.`,
        };
      }

      // Check if leadership role aligns with the target domain
      const isDomainAligned = this.isTargetDomainAligned(
        cleanTitle,
        titleTokens,
        targetRoles,
        confirmedOpportunityTitles,
      );

      if (isDomainAligned) {
        return {
          relevance: 'HIGH',
          recommendationRationale: `Functional decision-maker role '${cleanTitle}' appropriate for career outreach.`,
        };
      }

      // Leadership role outside direct target domain
      return {
        relevance: 'MEDIUM',
        recommendationRationale: `Leadership role '${cleanTitle}' outside direct target function.`,
      };
    }

    // 6. Broad Department Match (Precedence 4 -> MEDIUM)
    const isDeptMatch = this.matchesAnyPattern(cleanTitle, DEPARTMENT_KEYWORDS);
    if (isDeptMatch) {
      return {
        relevance: 'MEDIUM',
        recommendationRationale: `Role '${cleanTitle}' belongs to target department for proactive outreach.`,
      };
    }

    // 7. Default Fallback (Precedence 5 -> LOW)
    return {
      relevance: 'LOW',
      recommendationRationale: `Role '${cleanTitle}' has limited direct alignment with target roles.`,
    };
  }

  private static normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static tokenize(text: string): string[] {
    return this.normalize(text)
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  }

  private static matchesRole(title: string, roleQuery: string): boolean {
    const normTitle = ` ${this.normalize(title)} `;
    const normRole = ` ${this.normalize(roleQuery)} `;
    if (normTitle.includes(normRole)) return true;
    if (normRole.includes(normTitle)) return true;

    const queryTokens = this.tokenize(roleQuery);
    const titleTokenSet = new Set(this.tokenize(title));

    if (queryTokens.length > 0 && queryTokens.every((t) => titleTokenSet.has(t))) {
      return true;
    }
    return false;
  }

  private static matchesAnyPattern(text: string, patterns: string[]): boolean {
    const normText = ` ${this.normalize(text)} `;
    return patterns.some((p) => {
      const normPattern = ` ${this.normalize(p)} `;
      return normText.includes(normPattern);
    });
  }

  private static isTargetDomainAligned(
    title: string,
    titleTokens: string[],
    targetRoles: string[],
    confirmedOpportunityTitles: string[],
  ): boolean {
    const targetTokenSet = new Set<string>();
    for (const r of [...targetRoles, ...confirmedOpportunityTitles]) {
      for (const t of this.tokenize(r)) {
        targetTokenSet.add(t);
      }
    }

    // Direct token overlap with target roles / opportunities
    if (titleTokens.some((t) => targetTokenSet.has(t))) {
      return true;
    }

    // Family overlap
    const hasTechTarget = Array.from(targetTokenSet).some((t) =>
      TECH_ENGINEERING_DOMAIN.has(t),
    );
    const hasTechTitle = titleTokens.some((t) =>
      TECH_ENGINEERING_DOMAIN.has(t),
    );
    if (hasTechTarget && hasTechTitle) {
      return true;
    }

    const hasProductTarget = Array.from(targetTokenSet).some((t) =>
      PRODUCT_DOMAIN.has(t),
    );
    const hasProductTitle = titleTokens.some((t) => PRODUCT_DOMAIN.has(t));
    if (hasProductTarget && hasProductTitle) {
      return true;
    }

    const hasMarketingTarget = Array.from(targetTokenSet).some((t) =>
      MARKETING_DOMAIN.has(t),
    );
    const hasMarketingTitle = titleTokens.some((t) => MARKETING_DOMAIN.has(t));
    if (hasMarketingTarget && hasMarketingTitle) {
      return true;
    }

    const hasSalesTarget = Array.from(targetTokenSet).some((t) =>
      SALES_DOMAIN.has(t),
    );
    const hasSalesTitle = titleTokens.some((t) => SALES_DOMAIN.has(t));
    if (hasSalesTarget && hasSalesTitle) {
      return true;
    }

    return false;
  }
}

