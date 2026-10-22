import { Injectable } from '@nestjs/common';
import { CompanyContactSelection, Person } from '@repo/db';
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
  ): Promise<Person[]> {
    return this.prisma.person.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findContactById(
    workspaceId: string,
    personId: string,
  ): Promise<Person | null> {
    return this.prisma.person.findFirst({
      where: {
        id: personId,
        workspaceId,
      },
    });
  }

  async upsertCompanyContacts(
    workspaceId: string,
    companyId: string,
    contacts: UpsertContactInput[],
  ): Promise<Person[]> {
    const results: Person[] = [];

    for (const c of contacts) {
      if (c.email) {
        // Upsert by [workspaceId, companyId, email]
        const upserted = await this.prisma.person.upsert({
          where: {
            workspaceId_email: {
              workspaceId,
              email: c.email,
            },
          },
          create: {
            workspaceId,
            personKind: c.personKind,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            title: c.title ?? null,
            source: c.source ?? null,
            sourceUrl: c.sourceUrl ?? null,
            confidence: c.confidence ?? 'MEDIUM',
            discoveredAt: c.discoveredAt ?? new Date(),
          },
          update: {
            personKind: c.personKind,
            firstName: c.firstName,
            lastName: c.lastName,
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
              companyAssociationId: c.companyId,
              personId: upserted.id,
              claim: `Identified contact ${upserted.firstName} ${upserted.lastName} (${upserted.title || 'No Title'})`,
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
        const existing = await this.prisma.person.findFirst({
          where: {
            workspaceId,
            firstName: c.firstName,
            lastName: c.lastName,
            title: c.title ?? null,
            email: null,
          },
        });

        if (existing) {
          const updated = await this.prisma.person.update({
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
          const created = await this.prisma.person.create({
            data: {
              workspaceId,
              personKind: c.personKind,
              firstName: c.firstName,
              lastName: c.lastName,
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
                personId: created.id,
                claim: `Identified contact ${created.firstName} ${created.lastName} (${created.title || 'No Title'})`,
                classification: 'FACT',
                companyAssociationId: c.companyId,
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
    personId: string,
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
        personId: personId,
        selectedAt: new Date(),
      },
      update: {
        personId: personId,
        selectedAt: new Date(),
      },
    });
  }
}
