import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Person,
  PersonCompanyAssociation,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  ContactCandidateRejection,
  ContactPersistenceResult,
  IContactRepository,
  UpsertContactInput,
} from '../domain/contact.repository.interface';
import { DiscoveredContactCandidate } from '../domain/contact.provider.interface';
import { getNullEmailCanonicalKey } from '../domain/contact-normalizer';

@Injectable()
export class PrismaContactRepository implements IContactRepository {
  private readonly logger = new Logger(PrismaContactRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findCompanyContacts(
    workspaceId: string,
    companyId: string,
  ): Promise<Person[]> {
    return this.prisma.person.findMany({
      where: {
        workspaceId,
        personCompanyAssociations: {
          some: {
            companyId,
          },
        },
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

        if (c.source || c.sourceUrl) {
          await this.prisma.evidence.create({
            data: {
              workspaceId,
              companyId,
              companyAssociationId: companyId,
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
                companyAssociationId: companyId,
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

  async persistDiscoveredContacts(
    workspaceId: string,
    companyId: string,
    contacts: DiscoveredContactCandidate[],
    txClient?: Prisma.TransactionClient,
  ): Promise<ContactPersistenceResult> {
    const executeInTx = async (
      tx: Prisma.TransactionClient,
    ): Promise<ContactPersistenceResult> => {
      // 1. Acquire deterministic transaction-scoped company advisory lock
      const lockKey = `${workspaceId}:${companyId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      let acceptedCount = 0;
      let rejectedConflictCount = 0;
      const persistedAssociations: PersonCompanyAssociation[] = [];
      const rejectedCandidates: ContactCandidateRejection[] = [];
      const diagnostics: string[] = [];

      for (const candidate of contacts) {
        if (candidate.email) {
          // Database-native ON CONFLICT DO NOTHING RETURNING id prevents transaction abort 25P02
          const newPersonId = randomUUID();
          const rawResult = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO "persons" (
              "id",
              "workspace_id",
              "person_kind",
              "first_name",
              "last_name",
              "email",
              "title",
              "source",
              "source_url",
              "confidence",
              "discovered_at",
              "created_at",
              "updated_at"
            ) VALUES (
              ${newPersonId},
              ${workspaceId},
              ${candidate.personKind}::"PersonKind",
              ${candidate.firstName ?? ''},
              ${candidate.lastName ?? ''},
              ${candidate.email},
              ${candidate.title ?? null},
              ${candidate.source ?? null},
              ${candidate.sourceUrl ?? null},
              ${candidate.confidence ?? null},
              ${new Date()},
              NOW(),
              NOW()
            )
            ON CONFLICT ("workspace_id", "email") DO NOTHING
            RETURNING "id"
          `;

          let person: Person;
          if (rawResult.length > 0) {
            const created = await tx.person.findUnique({
              where: { id: rawResult[0].id },
            });
            if (!created) {
              throw new Error(
                `Newly created Person ${rawResult[0].id} could not be loaded`,
              );
            }
            person = created;
          } else {
            const found = await tx.person.findUnique({
              where: {
                workspaceId_email: {
                  workspaceId,
                  email: candidate.email,
                },
              },
            });
            if (!found) {
              throw new Error(
                `Person with email ${candidate.email} could not be loaded`,
              );
            }
            person = found;
          }

          // Invariant: Check PERSON_KIND_CONFLICT
          if (person.personKind !== candidate.personKind) {
            this.logger.warn(
              `PERSON_KIND_CONFLICT for email "${candidate.email}": existing kind "${person.personKind}", candidate kind "${candidate.personKind}". Rejecting candidate.`,
            );
            rejectedConflictCount++;
            rejectedCandidates.push({
              candidateEmail: candidate.email,
              candidateName:
                `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() ||
                null,
              personKind: candidate.personKind,
              reason: 'PERSON_KIND_CONFLICT',
              message: `Person kind conflict: existing record has kind "${person.personKind}", incoming candidate has kind "${candidate.personKind}"`,
            });
            continue;
          }

          // Reconcile PersonCompanyAssociation
          let assoc = await tx.personCompanyAssociation.findFirst({
            where: {
              workspaceId,
              companyId,
              personId: person.id,
            },
          });

          if (!assoc) {
            assoc = await tx.personCompanyAssociation.create({
              data: {
                workspaceId,
                companyId,
                personId: person.id,
                role: candidate.title ?? null,
                workEmail: candidate.email ?? null,
                whyThisPerson: 'Discovered from public web presence',
              },
            });
          } else {
            if (!assoc.role && candidate.title) {
              assoc = await tx.personCompanyAssociation.update({
                where: { id: assoc.id },
                data: { role: candidate.title },
              });
            }
          }

          persistedAssociations.push(assoc);
          acceptedCount++;

          // Link Evidence authoritatively to assoc.id
          if (candidate.evidence && candidate.evidence.length > 0) {
            for (const ev of candidate.evidence) {
              const existingEv = await tx.evidence.findFirst({
                where: {
                  workspaceId,
                  companyId,
                  companyAssociationId: assoc.id,
                  claim: ev.claim,
                  sourceUrl: ev.sourceUrl,
                },
              });

              if (!existingEv) {
                await tx.evidence.create({
                  data: {
                    workspaceId,
                    companyId,
                    companyAssociationId: assoc.id,
                    personId: person.id,
                    claim: ev.claim,
                    sourceName: ev.sourceName,
                    sourceUrl: ev.sourceUrl,
                    sourceExcerpt: ev.sourceExcerpt,
                    classification: ev.classification,
                    confidence: ev.confidence,
                    collectedAt: new Date(),
                  },
                });
              }
            }
          }
        } else {
          // Candidate with null email: Match by canonical composite key
          const candidateKey = getNullEmailCanonicalKey(
            candidate.firstName,
            candidate.lastName,
            candidate.title,
          );

          const existingAssocs = await tx.personCompanyAssociation.findMany({
            where: {
              workspaceId,
              companyId,
              person: { email: null },
            },
            include: { person: true },
          });

          const matchedAssoc = existingAssocs.find((a) => {
            const existingKey = getNullEmailCanonicalKey(
              a.person.firstName,
              a.person.lastName,
              a.person.title,
            );
            return existingKey === candidateKey;
          });

          let person: Person;
          let assoc: PersonCompanyAssociation;

          if (matchedAssoc) {
            person = matchedAssoc.person;
            assoc = matchedAssoc;
            persistedAssociations.push(assoc);
            acceptedCount++;
          } else {
            person = await tx.person.create({
              data: {
                workspaceId,
                personKind: candidate.personKind,
                firstName: candidate.firstName ?? '',
                lastName: candidate.lastName ?? '',
                email: null,
                title: candidate.title ?? null,
                source: candidate.source,
                sourceUrl: candidate.sourceUrl,
                confidence: candidate.confidence,
                discoveredAt: new Date(),
              },
            });

            assoc = await tx.personCompanyAssociation.create({
              data: {
                workspaceId,
                companyId,
                personId: person.id,
                role: candidate.title ?? null,
                workEmail: null,
                whyThisPerson: 'Discovered from public web presence',
              },
            });
            persistedAssociations.push(assoc);
            acceptedCount++;
          }

          // Link Evidence authoritatively to assoc.id
          if (candidate.evidence && candidate.evidence.length > 0) {
            for (const ev of candidate.evidence) {
              const existingEv = await tx.evidence.findFirst({
                where: {
                  workspaceId,
                  companyId,
                  companyAssociationId: assoc.id,
                  claim: ev.claim,
                  sourceUrl: ev.sourceUrl,
                },
              });

              if (!existingEv) {
                await tx.evidence.create({
                  data: {
                    workspaceId,
                    companyId,
                    companyAssociationId: assoc.id,
                    personId: person.id,
                    claim: ev.claim,
                    sourceName: ev.sourceName,
                    sourceUrl: ev.sourceUrl,
                    sourceExcerpt: ev.sourceExcerpt,
                    classification: ev.classification,
                    confidence: ev.confidence,
                    collectedAt: new Date(),
                  },
                });
              }
            }
          }
        }
      }

      return {
        acceptedCount,
        rejectedConflictCount,
        persistedAssociations,
        rejectedCandidates,
        diagnostics,
      };
    };

    if (txClient) {
      return executeInTx(txClient);
    }
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => executeInTx(tx),
    );
  }
}
