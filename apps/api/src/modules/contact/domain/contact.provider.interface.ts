export const CONTACT_DISCOVERY_PROVIDER_TOKEN =
  'CONTACT_DISCOVERY_PROVIDER_TOKEN';

export type RoleFamily =
  | 'LEADERSHIP'
  | 'ENGINEERING'
  | 'PRODUCT'
  | 'RECRUITING'
  | 'GENERAL';

export interface DiscoveredContactEvidence {
  claim: string;
  sourceName: string;
  sourceUrl: string;
  sourceExcerpt: string;
  classification: 'FACT';
  confidence: 'HIGH' | 'MEDIUM';
}

export interface DiscoveredContactCandidate {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  roleFamily?: RoleFamily | null;
  source: string;
  sourceUrl: string;
  evidence?: DiscoveredContactEvidence[];
}

export interface ContactDiscoveryInput {
  companyId: string;
  workspaceId: string;
  companyName: string;
  domain?: string;
  industry?: string;
  websiteUrl?: string;
  targetRoles?: string[];
}

export interface ContactDiscoveryResult {
  companyId: string;
  workspaceId: string;
  discoveredAt: Date;
  candidates: DiscoveredContactCandidate[];
  mock?: boolean;
  status?: 'COMPLETED' | 'PARTIAL' | 'IDENTITY_HALTED';
  unknowns?: string[];
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export interface ContactDiscoveryProvider {
  discoverContacts(
    input: ContactDiscoveryInput,
  ): Promise<ContactDiscoveryResult>;
}
