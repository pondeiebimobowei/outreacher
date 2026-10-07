import {
  PrismaClient,
  OpportunityStatus,
  OpportunityType,
  SuppressionReason,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { GetCompanyContactsUseCase } from '../../src/modules/contact/application/get-company-contacts.use-case';
import { AppNotFoundException } from '../../src/common/errors/application.exception';

describe('Contact Recommendation Ranking & Explanation (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let contactRepository: PrismaContactRepository;
  let getContactsUseCase: GetCompanyContactsUseCase;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    contactRepository = new PrismaContactRepository(prismaService);
    getContactsUseCase = new GetCompanyContactsUseCase(
      prismaService,
      contactRepository,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('proves end-to-end ranking precedence, bucket partitioning, tie-break, cross-company evidence isolation, and suppression in real PostgreSQL', async () => {
    // -------------------------------------------------------------------------
    // 1. Setup Workspace, Career Profile, and Confirmed Opportunity
    // -------------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: 'Ranking WS' },
    });
    const workspaceId = workspace.id;

    await prisma.careerProfile.create({
      data: {
        workspaceId,
        targetRoles: ['Backend Engineer'],
      },
    });

    const companyA = await prisma.company.create({
      data: {
        workspaceId,
        name: 'Alpha Corp',
        normalizedName: 'alphacorp',
        domain: 'alphacorp.com',
      },
    });

    const companyB = await prisma.company.create({
      data: {
        workspaceId,
        name: 'Beta Corp',
        normalizedName: 'betacorp',
        domain: 'betacorp.com',
      },
    });

    await prisma.opportunity.create({
      data: {
        workspaceId,
        companyId: companyA.id,
        roleTitle: 'Staff Infrastructure Engineer',
        status: OpportunityStatus.ACTIVE,
        opportunityType: OpportunityType.CONFIRMED,
      },
    });

    // -------------------------------------------------------------------------
    // 2. Persist 5 Candidates into Company A via real persistDiscoveredContacts
    // -------------------------------------------------------------------------
    const persistResultA = await contactRepository.persistDiscoveredContacts(
      workspaceId,
      companyA.id,
      [
        {
          // Candidate 1: Matches confirmed opening
          firstName: 'Alice',
          lastName: 'Infra',
          email: 'alice@alphacorp.com',
          title: 'Staff Infrastructure Engineer',
          personKind: 'PERSON',
          confidence: 'HIGH',
          evidence: [
            {
              claim: 'Confirmed Staff Infrastructure opening on Careers page',
              classification: 'FACT',
              sourceName: 'Careers Page',
              sourceUrl: 'https://alphacorp.com/careers',
            },
          ],
        },
        {
          // Candidate 2: Matches target role
          firstName: 'Bob',
          lastName: 'Backend',
          email: 'bob@alphacorp.com',
          title: 'Senior Backend Engineer',
          personKind: 'PERSON',
          confidence: 'HIGH',
          evidence: [
            {
              claim: 'Team lead of backend core services',
              classification: 'FACT',
              sourceName: 'Team Page',
              sourceUrl: 'https://alphacorp.com/team',
            },
          ],
        },
        {
          // Candidate 3: Matches target role but NO email
          firstName: 'Charlie',
          lastName: 'Backend',
          email: null,
          title: 'Lead Backend Engineer',
          personKind: 'PERSON',
          confidence: 'MEDIUM',
          evidence: [
            {
              claim: 'Author of public backend engineering blog post',
              classification: 'FACT',
              sourceName: 'Tech Blog',
              sourceUrl: 'https://alphacorp.com/blog/backend',
            },
          ],
        },
        {
          // Candidate 4: Leadership outside direct target domain
          firstName: 'Diana',
          lastName: 'Marketing',
          email: 'diana@alphacorp.com',
          title: 'Director of Marketing',
          personKind: 'PERSON',
          confidence: 'HIGH',
          evidence: [],
        },
        {
          // Candidate 5: Unrelated role
          firstName: 'Edward',
          lastName: 'Facilities',
          email: 'edward@alphacorp.com',
          title: 'Office Manager',
          personKind: 'PERSON',
          confidence: 'LOW',
          evidence: [],
        },
      ],
    );

    expect(persistResultA.acceptedCount).toBe(5);

    // -------------------------------------------------------------------------
    // 3. Setup Cross-Company Evidence Isolation Test:
    // Associate Bob with Company B as well, and add Company B-specific Evidence
    // -------------------------------------------------------------------------
    const persistResultB = await contactRepository.persistDiscoveredContacts(
      workspaceId,
      companyB.id,
      [
        {
          firstName: 'Bob',
          lastName: 'Backend',
          email: 'bob@alphacorp.com', // same person email
          title: 'Consultant',
          personKind: 'PERSON',
          confidence: 'HIGH',
          evidence: [
            {
              claim: 'Advisory board member at Beta Corp',
              classification: 'FACT',
              sourceName: 'Beta Advisory Page',
              sourceUrl: 'https://betacorp.com/advisors',
            },
          ],
        },
      ],
    );
    expect(persistResultB.acceptedCount).toBe(1);

    // Verify Bob is one Person with two distinct PersonCompanyAssociations
    const bobPerson = await prisma.person.findFirst({
      where: { workspaceId, email: 'bob@alphacorp.com' },
      include: { personCompanyAssociations: true, evidence: true },
    });
    expect(bobPerson?.personCompanyAssociations).toHaveLength(2);
    expect(bobPerson?.evidence).toHaveLength(2);

    const bobEvCompanyA = bobPerson!.evidence.find((e) => e.companyId === companyA.id);
    const bobEvCompanyB = bobPerson!.evidence.find((e) => e.companyId === companyB.id);
    expect(bobEvCompanyA).toBeDefined();
    expect(bobEvCompanyB).toBeDefined();
    expect(bobEvCompanyA!.id).not.toBe(bobEvCompanyB!.id);

    // -------------------------------------------------------------------------
    // 4. Query Company A Contacts via UseCase & Validate Bucket Partitioning
    // -------------------------------------------------------------------------
    const viewA = await getContactsUseCase.execute(workspaceId, companyA.id);

    expect(viewA.companyId).toBe(companyA.id);
    expect(viewA.status).toBe('COMPLETED');
    expect(viewA.contacts).toHaveLength(5);

    // Partition invariant check
    expect(viewA.contacts.length).toBe(
      viewA.recommended.length + viewA.other.length + viewA.unavailable.length,
    );

    // Verify candidate ranking:
    // 1 & 2: Alice & Bob (both HIGH, AVAILABLE - tied on relevance and contactability, ordered by id ASC)
    // 3: Charlie (HIGH, UNAVAILABLE - matched target role, no email)
    // 4: Diana (MEDIUM, AVAILABLE - leadership outside target domain)
    // 5: Edward (LOW, AVAILABLE - unrelated)
    const [top1, top2, c3, c4, c5] = viewA.contacts;

    // Tie-break invariant: top1.id < top2.id
    expect(top1.relevance).toBe('HIGH');
    expect(top1.emailConfidence).toBe('AVAILABLE');
    expect(top2.relevance).toBe('HIGH');
    expect(top2.emailConfidence).toBe('AVAILABLE');
    expect(top1.id.localeCompare(top2.id)).toBeLessThan(0);
    expect(new Set([top1.firstName, top2.firstName])).toEqual(new Set(['Alice', 'Bob']));

    const aliceDto = viewA.contacts.find((c) => c.firstName === 'Alice')!;
    expect(aliceDto.relevance).toBe('HIGH');
    expect(aliceDto.emailConfidence).toBe('AVAILABLE');
    expect(aliceDto.recommendationRationale).toContain('Staff Infrastructure Engineer');
    expect(aliceDto.whyRecommended).toBe(aliceDto.recommendationRationale);

    const bobDto = viewA.contacts.find((c) => c.firstName === 'Bob')!;
    expect(bobDto.relevance).toBe('HIGH');
    expect(bobDto.emailConfidence).toBe('AVAILABLE');
    expect(bobDto.recommendationRationale).toContain('Backend Engineer');
    expect(bobDto.whyRecommended).toBe(bobDto.recommendationRationale);

    // Charlie: Dimension Independence (HIGH relevance, UNAVAILABLE email)
    expect(c3.firstName).toBe('Charlie');
    expect(c3.relevance).toBe('HIGH');
    expect(c3.emailConfidence).toBe('UNAVAILABLE');

    expect(c4.firstName).toBe('Diana');
    expect(c4.relevance).toBe('MEDIUM');
    expect(c4.emailConfidence).toBe('AVAILABLE');

    expect(c5.firstName).toBe('Edward');
    expect(c5.relevance).toBe('LOW');
    expect(c5.emailConfidence).toBe('AVAILABLE');

    // Bucket membership preserves relative order:
    expect(new Set(viewA.recommended.map((c) => c.firstName))).toEqual(new Set(['Alice', 'Bob', 'Diana']));
    expect(viewA.recommended[2].firstName).toBe('Diana');
    expect(viewA.unavailable.map((c) => c.firstName)).toEqual(['Charlie']);
    expect(viewA.other.map((c) => c.firstName)).toEqual(['Edward']);


    // Cross-company evidence isolation on Bob:
    const bobDtoCompanyA = viewA.contacts.find((c) => c.id === bobPerson!.id);
    expect(bobDtoCompanyA?.evidenceIds).toEqual([bobEvCompanyA!.id]);
    expect(bobDtoCompanyA?.evidenceIds).not.toContain(bobEvCompanyB!.id);

    // Query Company B contacts and verify evidence isolation in reverse
    const viewB = await getContactsUseCase.execute(workspaceId, companyB.id);
    const bobDtoCompanyB = viewB.contacts.find((c) => c.id === bobPerson!.id);
    expect(bobDtoCompanyB?.evidenceIds).toEqual([bobEvCompanyB!.id]);
    expect(bobDtoCompanyB?.evidenceIds).not.toContain(bobEvCompanyA!.id);

    // -------------------------------------------------------------------------
    // 5. Suppression Invariant Test:
    // Suppress Alice's email in the workspace
    // -------------------------------------------------------------------------
    await prisma.suppression.create({
      data: {
        workspaceId,
        email: 'alice@alphacorp.com',
        reason: SuppressionReason.MANUAL,
        source: 'TEST',
      },
    });

    const viewASuppressed = await getContactsUseCase.execute(workspaceId, companyA.id);
    const aliceSuppressed = viewASuppressed.contacts.find((c) => c.email === 'alice@alphacorp.com');

    expect(aliceSuppressed).toBeDefined();
    // Dimension independence preserved under suppression
    expect(aliceSuppressed!.relevance).toBe('HIGH');
    expect(aliceSuppressed!.emailConfidence).toBe('UNAVAILABLE');

    // Alice moved from recommended to unavailable bucket
    expect(viewASuppressed.recommended.map((c) => c.firstName)).toEqual(['Bob', 'Diana']);
    expect(new Set(viewASuppressed.unavailable.map((c) => c.firstName))).toEqual(new Set(['Alice', 'Charlie']));
    expect(viewASuppressed.unavailable[0].id.localeCompare(viewASuppressed.unavailable[1].id)).toBeLessThan(0);
    expect(viewASuppressed.other.map((c) => c.firstName)).toEqual(['Edward']);


    // -------------------------------------------------------------------------
    // 6. Multi-Tenant Workspace Isolation Test
    // -------------------------------------------------------------------------
    const foreignWs = await prisma.workspace.create({
      data: { name: 'Foreign WS' },
    });
    await expect(
      getContactsUseCase.execute(foreignWs.id, companyA.id),
    ).rejects.toThrow(AppNotFoundException);
  });
});
