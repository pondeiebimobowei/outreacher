import { Person, CompanyContactSelection } from '@repo/db';

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
  getCompanyContactSelection(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyContactSelection | null>;
  setCompanyContactSelection(
    workspaceId: string,
    companyId: string,
    personId: string,
    companyAssociationId: string,
  ): Promise<CompanyContactSelection>;
}
