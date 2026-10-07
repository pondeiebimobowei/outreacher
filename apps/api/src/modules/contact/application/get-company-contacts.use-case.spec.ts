import { Test, TestingModule } from '@nestjs/testing';
import { OpportunityStatus, OpportunityType } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { CONTACT_REPOSITORY_TOKEN } from '../domain/contact.repository.interface';
import { GetCompanyContactsUseCase } from './get-company-contacts.use-case';

describe('GetCompanyContactsUseCase', () => {
  let useCase: GetCompanyContactsUseCase;
  let prismaMock: any;
  let contactRepoMock: any;

  const workspaceId = 'ws-test-1';
  const companyId = 'comp-test-1';

  beforeEach(async () => {
    prismaMock = {
      company: {
        findFirst: jest.fn(),
      },
      careerProfile: {
        findUnique: jest.fn(),
      },
      opportunity: {
        findMany: jest.fn(),
      },
      job: {
        findFirst: jest.fn(),
      },
      personCompanyAssociation: {
        findMany: jest.fn(),
      },
      evidence: {
        findMany: jest.fn(),
      },
      suppression: {
        findMany: jest.fn(),
      },
    };

    contactRepoMock = {
      findCompanyContacts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetCompanyContactsUseCase,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CONTACT_REPOSITORY_TOKEN, useValue: contactRepoMock },
      ],
    }).compile();

    useCase = module.get<GetCompanyContactsUseCase>(GetCompanyContactsUseCase);
  });

  it('throws AppNotFoundException if company is not found in workspace', async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);

    await expect(useCase.execute(workspaceId, companyId)).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('partitions candidates into disjoint buckets preserving stable ordering and relative order', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: companyId, workspaceId });
    prismaMock.careerProfile.findUnique.mockResolvedValue({
      workspaceId,
      targetRoles: ['Backend Engineer'],
    });
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    prismaMock.job.findFirst.mockResolvedValue(null);
    prismaMock.suppression.findMany.mockResolvedValue([]);

    // 4 Candidates:
    // P1: Senior Backend Engineer, has email -> HIGH relevance, AVAILABLE -> recommended
    // P2: Senior Backend Engineer, no email -> HIGH relevance, UNAVAILABLE -> unavailable
    // P3: Software Developer, has email -> MEDIUM relevance, AVAILABLE -> recommended
    // P4: Office Manager, has email -> LOW relevance, AVAILABLE -> other
    const rawContacts = [
      {
        id: 'p4',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Dan',
        lastName: 'Manager',
        email: 'dan@test.com',
        title: 'Office Manager',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'p2',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Bob',
        lastName: 'Backend',
        email: null,
        title: 'Senior Backend Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'p1',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Alice',
        lastName: 'Backend',
        email: 'alice@test.com',
        title: 'Senior Backend Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'p3',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Charlie',
        lastName: 'Dev',
        email: 'charlie@test.com',
        title: 'Software Developer',
        source: null,
        sourceUrl: null,
        confidence: 'MEDIUM',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ];
    contactRepoMock.findCompanyContacts.mockResolvedValue(rawContacts);
    prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-1', personId: 'p1', companyId, workspaceId },
      { id: 'pca-2', personId: 'p2', companyId, workspaceId },
      { id: 'pca-3', personId: 'p3', companyId, workspaceId },
      { id: 'pca-4', personId: 'p4', companyId, workspaceId },
    ]);
    prismaMock.evidence.findMany.mockResolvedValue([]);

    const res = await useCase.execute(workspaceId, companyId);

    // 1. Stable sorted order:
    // P1 (HIGH, AVAILABLE)
    // P2 (HIGH, UNAVAILABLE)
    // P3 (MEDIUM, AVAILABLE)
    // P4 (LOW, AVAILABLE)
    expect(res.contacts.map((c) => c.id)).toEqual(['p1', 'p2', 'p3', 'p4']);

    // 2. Disjoint buckets
    expect(res.recommended.map((c) => c.id)).toEqual(['p1', 'p3']);
    expect(res.unavailable.map((c) => c.id)).toEqual(['p2']);
    expect(res.other.map((c) => c.id)).toEqual(['p4']);

    // 3. Partition invariant: contacts = recommended + other + unavailable
    expect(res.contacts.length).toBe(
      res.recommended.length + res.other.length + res.unavailable.length,
    );

    // 4. Dimension independence: P2 has HIGH relevance even with null email
    const p2Contact = res.contacts.find((c) => c.id === 'p2');
    expect(p2Contact?.relevance).toBe('HIGH');
    expect(p2Contact?.emailConfidence).toBe('UNAVAILABLE');

    // 5. whyRecommended matches recommendationRationale
    for (const c of res.contacts) {
      expect(c.whyRecommended).toBe(c.recommendationRationale);
    }
  });

  it('determines deterministic tie-break by person.id ASC when relevance and contactability match', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: companyId, workspaceId });
    prismaMock.careerProfile.findUnique.mockResolvedValue({
      workspaceId,
      targetRoles: ['Backend Engineer'],
    });
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    prismaMock.job.findFirst.mockResolvedValue(null);
    prismaMock.suppression.findMany.mockResolvedValue([]);

    // Two candidates with identical HIGH relevance and AVAILABLE email, but different IDs
    const rawContacts = [
      {
        id: 'person-zebra',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Zoe',
        lastName: 'Zebra',
        email: 'zoe@test.com',
        title: 'Backend Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'person-alpha',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Alex',
        lastName: 'Alpha',
        email: 'alex@test.com',
        title: 'Backend Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ];
    contactRepoMock.findCompanyContacts.mockResolvedValue(rawContacts);
    prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-z', personId: 'person-zebra', companyId, workspaceId },
      { id: 'pca-a', personId: 'person-alpha', companyId, workspaceId },
    ]);
    prismaMock.evidence.findMany.mockResolvedValue([]);

    const res = await useCase.execute(workspaceId, companyId);
    expect(res.contacts.map((c) => c.id)).toEqual(['person-alpha', 'person-zebra']);
  });

  it('strictly isolates evidence to (workspaceId, companyId, personId, association.id) and never leaks cross-company evidence', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: companyId, workspaceId });
    prismaMock.careerProfile.findUnique.mockResolvedValue(null);
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    prismaMock.job.findFirst.mockResolvedValue(null);
    prismaMock.suppression.findMany.mockResolvedValue([]);

    const rawContacts = [
      {
        id: 'person-multi-company',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Sam',
        lastName: 'Engineer',
        email: 'sam@test.com',
        title: 'Software Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    contactRepoMock.findCompanyContacts.mockResolvedValue(rawContacts);

    // Association for this company
    prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-comp-1', personId: 'person-multi-company', companyId, workspaceId },
    ]);

    // Evidence mock query
    prismaMock.evidence.findMany.mockResolvedValue([
      {
        id: 'ev-valid-comp-1',
        personId: 'person-multi-company',
        companyAssociationId: 'pca-comp-1',
      },
    ]);

    const res = await useCase.execute(workspaceId, companyId);
    expect(res.contacts[0].evidenceIds).toEqual(['ev-valid-comp-1']);

    // Verify Prisma query was strictly scoped to this company and its association
    expect(prismaMock.evidence.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        companyId,
        companyAssociationId: { in: ['pca-comp-1'] },
        personId: { in: ['person-multi-company'] },
      },
      select: {
        id: true,
        personId: true,
        companyAssociationId: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  });

  it('marks suppressed contacts as UNAVAILABLE contactability while retaining high career relevance', async () => {
    prismaMock.company.findFirst.mockResolvedValue({ id: companyId, workspaceId });
    prismaMock.careerProfile.findUnique.mockResolvedValue({
      workspaceId,
      targetRoles: ['Backend Engineer'],
    });
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    prismaMock.job.findFirst.mockResolvedValue(null);

    // Email is actively suppressed in workspace
    prismaMock.suppression.findMany.mockResolvedValue([
      { email: 'suppressed@test.com' },
    ]);

    const rawContacts = [
      {
        id: 'p-suppressed',
        workspaceId,
        personKind: 'PERSON',
        firstName: 'Sam',
        lastName: 'Suppressed',
        email: 'suppressed@test.com',
        title: 'Senior Backend Engineer',
        source: null,
        sourceUrl: null,
        confidence: 'HIGH',
        discoveredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    contactRepoMock.findCompanyContacts.mockResolvedValue(rawContacts);
    prismaMock.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-sup', personId: 'p-suppressed', companyId, workspaceId },
    ]);
    prismaMock.evidence.findMany.mockResolvedValue([]);

    const res = await useCase.execute(workspaceId, companyId);
    const candidate = res.contacts[0];

    // Dimension independence check
    expect(candidate.relevance).toBe('HIGH');
    expect(candidate.emailConfidence).toBe('UNAVAILABLE');
    expect(res.unavailable).toHaveLength(1);
    expect(res.recommended).toHaveLength(0);
  });
});
