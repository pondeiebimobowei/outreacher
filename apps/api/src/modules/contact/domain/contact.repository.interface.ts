import {
  Person,
  PersonCompanyAssociation,
  Prisma,
} from '@repo/db';
import { DiscoveredContactCandidate } from './contact.provider.interface';

export const CONTACT_REPOSITORY_TOKEN = 'CONTACT_REPOSITORY_TOKEN';

export interface UpsertContactInput {
  workspaceId: string;
  companyId: string;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  firstName: string;
  lastName: string;
  email?: string | null;
  title?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  confidence?: string | null;
  discoveredAt?: Date | null;
}

export interface ContactCandidateRejection {
  candidateEmail?: string | null;
  candidateName?: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  reason: 'PERSON_KIND_CONFLICT';
  message: string;
}

export interface ContactPersistenceResult {
  acceptedCount: number;
  rejectedConflictCount: number;
  persistedAssociations: PersonCompanyAssociation[];
  rejectedCandidates: ContactCandidateRejection[];
  diagnostics: string[];
}

export interface IContactRepository {
  findCompanyContacts(
    workspaceId: string,
    companyId: string,
  ): Promise<Person[]>;
  findContactById(
    workspaceId: string,
    personId: string,
  ): Promise<Person | null>;
  upsertCompanyContacts(
    workspaceId: string,
    companyId: string,
    contacts: UpsertContactInput[],
  ): Promise<Person[]>;
  persistDiscoveredContacts(
    workspaceId: string,
    companyId: string,
    contacts: DiscoveredContactCandidate[],
    tx?: Prisma.TransactionClient,
  ): Promise<ContactPersistenceResult>;
}
