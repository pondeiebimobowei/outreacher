import { PersonKind, OpportunityType, EvidenceClassification } from '@repo/db';

export interface OutreachContext {
  workspaceId: string;
  campaignMemberId: string;
  person: {
    id: string;
    firstName: string; lastName: string;
    title?: string | null;
    kind: PersonKind;
  };
  company: {
    id: string;
    name: string;
    domain?: string | null;
    description?: string | null;
    industry?: string | null;
  };
  opportunity: {
    id?: string | null;
    type: OpportunityType; // CONFIRMED | PROACTIVE | UNCLASSIFIED
    roleTitle?: string | null;
    roleDescription?: string | null;
  };
  careerProfile: {
    headline?: string | null;
    summary?: string | null;
    experienceSummary?: string | null;
    targetRoles: string[];
    skills: string[];
  };
  evidence: Array<{
    id: string;
    claim: string;
    classification: EvidenceClassification; // FACT | INFERENCE | UNKNOWN
    sourceName?: string | null;
    sourceUrl?: string | null;
  }>;
}
