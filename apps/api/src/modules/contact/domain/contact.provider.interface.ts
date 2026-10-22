export const CONTACT_DISCOVERY_PROVIDER_TOKEN =
  'CONTACT_DISCOVERY_PROVIDER_TOKEN';

export interface ContactDiscoveryInput {
  companyId: string;
  workspaceId: string;
  companyName: string;
  domain?: string;
  industry?: string;
  websiteUrl?: string;
  targetRoles?: string[];
}

export interface DiscoveredContactCandidate {
  firstName: string;
  lastName: string;
  title?: string;
  email?: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  source?: string;
  sourceUrl?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ContactDiscoveryResult {
  companyId: string;
  workspaceId: string;
  discoveredAt: Date;
  candidates: DiscoveredContactCandidate[];
  mock?: boolean;
}

export interface ContactDiscoveryProvider {
  discoverContacts(
    input: ContactDiscoveryInput,
  ): Promise<ContactDiscoveryResult>;
}
