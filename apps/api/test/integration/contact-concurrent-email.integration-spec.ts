import { PrismaClient } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { PrismaService } from '../../src/database/prisma.service';
import { DiscoveredContactCandidate } from '../../src/modules/contact/domain/contact.provider.interface';

describe('Cross-Company Same-Email Concurrency (Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let contactRepository: PrismaContactRepository;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    contactRepository = new PrismaContactRepository(prismaService);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('coalesces concurrent cross-company insertions for the same email into exactly 1 Person and 2 distinct associations without P2002 errors', async () => {
    // 1. Seed Workspace and two distinct Companies
    const workspace = await prisma.workspace.create({
      data: { name: 'Shared Email Workspace' },
    });

    const company1 = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Company Alpha',
        normalizedName: 'company alpha',
        domain: 'alpha.com',
      },
    });

    const company2 = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Company Beta',
        normalizedName: 'company beta',
        domain: 'beta.com',
      },
    });

    const candidateAlpha: DiscoveredContactCandidate = {
      firstName: 'Shared',
      lastName: 'Executive',
      title: 'Board Director',
      email: 'shared.director@boardmembers.org',
      personKind: 'PERSON',
      confidence: 'HIGH',
      source: 'PUBLIC_WEB',
      sourceUrl: 'https://alpha.com/board',
      evidence: [
        {
          claim: 'Shared Executive serves on board of Company Alpha',
          sourceName: 'Alpha Board',
          sourceUrl: 'https://alpha.com/board',
          sourceExcerpt: 'Shared Executive serves on board',
          classification: 'FACT',
          confidence: 'HIGH',
        },
      ],
    };

    const candidateBeta: DiscoveredContactCandidate = {
      firstName: 'Shared',
      lastName: 'Executive',
      title: 'Advisor',
      email: 'shared.director@boardmembers.org',
      personKind: 'PERSON',
      confidence: 'HIGH',
      source: 'PUBLIC_WEB',
      sourceUrl: 'https://beta.com/advisors',
      evidence: [
        {
          claim: 'Shared Executive advises Company Beta',
          sourceName: 'Beta Advisors',
          sourceUrl: 'https://beta.com/advisors',
          sourceExcerpt: 'Shared Executive advises Company Beta',
          classification: 'FACT',
          confidence: 'HIGH',
        },
      ],
    };

    // 2. Launch concurrent insertions for both companies in the same workspace
    const [resultAlpha, resultBeta] = await Promise.all([
      contactRepository.persistDiscoveredContacts(
        workspace.id,
        company1.id,
        [candidateAlpha],
      ),
      contactRepository.persistDiscoveredContacts(
        workspace.id,
        company2.id,
        [candidateBeta],
      ),
    ]);

    // 3. Verify acceptance counts
    expect(resultAlpha.acceptedCount).toBe(1);
    expect(resultAlpha.rejectedConflictCount).toBe(0);
    expect(resultBeta.acceptedCount).toBe(1);
    expect(resultBeta.rejectedConflictCount).toBe(0);

    // 4. Assert database invariants: exactly 1 Person row globally in workspace
    const persons = await prisma.person.findMany({
      where: {
        workspaceId: workspace.id,
        email: 'shared.director@boardmembers.org',
      },
    });
    expect(persons).toHaveLength(1);
    const sharedPerson = persons[0];

    // 5. Assert exactly 2 distinct PersonCompanyAssociation rows, both linked to sharedPerson
    const associations = await prisma.personCompanyAssociation.findMany({
      where: {
        workspaceId: workspace.id,
        personId: sharedPerson.id,
      },
    });
    expect(associations).toHaveLength(2);

    const alphaAssoc = associations.find((a) => a.companyId === company1.id);
    const betaAssoc = associations.find((a) => a.companyId === company2.id);

    expect(alphaAssoc).toBeDefined();
    expect(betaAssoc).toBeDefined();
    expect(alphaAssoc?.role).toBe('Board Director');
    expect(betaAssoc?.role).toBe('Advisor');

    // 6. Assert evidence rows linked to each respective association
    const evidenceList = await prisma.evidence.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(evidenceList).toHaveLength(2);

    const alphaEv = evidenceList.find((e) => e.companyId === company1.id);
    const betaEv = evidenceList.find((e) => e.companyId === company2.id);

    expect(alphaEv?.companyAssociationId).toBe(alphaAssoc?.id);
    expect(betaEv?.companyAssociationId).toBe(betaAssoc?.id);
  });
});
