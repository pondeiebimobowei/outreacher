import { Contact, CompanyContactSelection } from '@repo/db';

export const CONTACT_REPOSITORY_TOKEN = 'CONTACT_REPOSITORY_TOKEN';

export interface UpsertContactInput {
  workspaceId: string;
  companyId: string;
  contactKind: 'PERSON' | 'ROLE_ADDRESS';
  name: string;
  email?: string | null;
  title?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  confidence?: string | null;
  discoveredAt?: Date | null;
}

export interface IContactRepository {
  findCompanyContacts(workspaceId: string, companyId: string): Promise<Contact[]>;
  findContactById(workspaceId: string, contactId: string): Promise<Contact | null>;
  upsertCompanyContacts(
    workspaceId: string,
    companyId: string,
    contacts: UpsertContactInput[],
  ): Promise<Contact[]>;
  getCompanyContactSelection(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyContactSelection | null>;
  setCompanyContactSelection(
    workspaceId: string,
    companyId: string,
    contactId: string,
  ): Promise<CompanyContactSelection>;
}
