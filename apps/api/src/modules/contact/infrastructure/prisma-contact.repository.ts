import { Injectable } from '@nestjs/common';
import { CompanyContactSelection, Contact } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  IContactRepository,
  UpsertContactInput,
} from '../domain/contact.repository.interface';

@Injectable()
export class PrismaContactRepository implements IContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCompanyContacts(
    workspaceId: string,
    companyId: string,
  ): Promise<Contact[]> {
    return this.prisma.contact.findMany({
      where: {
        workspaceId,
        companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findContactById(
    workspaceId: string,
    contactId: string,
  ): Promise<Contact | null> {
    return this.prisma.contact.findFirst({
      where: {
        id: contactId,
        workspaceId,
      },
    });
  }

  async upsertCompanyContacts(
    workspaceId: string,
    companyId: string,
    contacts: UpsertContactInput[],
  ): Promise<Contact[]> {
    const results: Contact[] = [];

    for (const c of contacts) {
      if (c.email) {
        // Upsert by [workspaceId, companyId, email]
        const upserted = await this.prisma.contact.upsert({
          where: {
            workspaceId_companyId_email: {
              workspaceId,
              companyId,
              email: c.email,
            },
          },
          create: {
            workspaceId,
            companyId,
            contactKind: c.contactKind,
            name: c.name,
            email: c.email,
            title: c.title ?? null,
            source: c.source ?? null,
            sourceUrl: c.sourceUrl ?? null,
            confidence: c.confidence ?? 'MEDIUM',
            discoveredAt: c.discoveredAt ?? new Date(),
          },
          update: {
            contactKind: c.contactKind,
            name: c.name,
            title: c.title ?? undefined,
            source: c.source ?? undefined,
            sourceUrl: c.sourceUrl ?? undefined,
            confidence: c.confidence ?? undefined,
            discoveredAt: c.discoveredAt ?? new Date(),
          },
        });

        // Store connected Evidence if source provenance exists
        if (c.source || c.sourceUrl) {
          await this.prisma.evidence.create({
            data: {
              workspaceId,
              companyId,
              contactId: upserted.id,
              claim: `Identified contact ${upserted.name} (${upserted.title || 'No Title'})`,
              classification: 'FACT',
              sourceName: c.source || 'Company Source',
              sourceUrl: c.sourceUrl || null,
              confidence: c.confidence || 'MEDIUM',
              collectedAt: new Date(),
            },
          });
        }

        results.push(upserted);
      } else {
        // Missing email -> Find existing by workspaceId + companyId + name + title or create
        const existing = await this.prisma.contact.findFirst({
          where: {
            workspaceId,
            companyId,
            name: c.name,
            title: c.title ?? null,
            email: null,
          },
        });

        if (existing) {
          const updated = await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              source: c.source ?? undefined,
              sourceUrl: c.sourceUrl ?? undefined,
              confidence: c.confidence ?? undefined,
              discoveredAt: c.discoveredAt ?? new Date(),
            },
          });
          results.push(updated);
        } else {
          const created = await this.prisma.contact.create({
            data: {
              workspaceId,
              companyId,
              contactKind: c.contactKind,
              name: c.name,
              email: null,
              title: c.title ?? null,
              source: c.source ?? null,
              sourceUrl: c.sourceUrl ?? null,
              confidence: c.confidence ?? 'MEDIUM',
              discoveredAt: c.discoveredAt ?? new Date(),
            },
          });

          if (c.source || c.sourceUrl) {
            await this.prisma.evidence.create({
              data: {
                workspaceId,
                companyId,
                contactId: created.id,
                claim: `Identified contact ${created.name} (${created.title || 'No Title'})`,
                classification: 'FACT',
                sourceName: c.source || 'Company Source',
                sourceUrl: c.sourceUrl || null,
                confidence: c.confidence || 'MEDIUM',
                collectedAt: new Date(),
              },
            });
          }

          results.push(created);
        }
      }
    }

    return results;
  }

  async getCompanyContactSelection(
    workspaceId: string,
    companyId: string,
  ): Promise<CompanyContactSelection | null> {
    return this.prisma.companyContactSelection.findUnique({
      where: {
        workspaceId_companyId: {
          workspaceId,
          companyId,
        },
      },
    });
  }

  async setCompanyContactSelection(
    workspaceId: string,
    companyId: string,
    contactId: string,
  ): Promise<CompanyContactSelection> {
    return this.prisma.companyContactSelection.upsert({
      where: {
        workspaceId_companyId: {
          workspaceId,
          companyId,
        },
      },
      create: {
        workspaceId,
        companyId,
        contactId,
        selectedAt: new Date(),
      },
      update: {
        contactId,
        selectedAt: new Date(),
      },
    });
  }
}
