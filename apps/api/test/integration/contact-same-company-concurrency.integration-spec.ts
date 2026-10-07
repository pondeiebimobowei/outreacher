import { PrismaClient } from '@repo/db';
import {
  cleanTestDatabase,
  getTestPgPool,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { PrismaService } from '../../src/database/prisma.service';
import { DiscoveredContactCandidate } from '../../src/modules/contact/domain/contact.provider.interface';

describe('Same-Company Advisory Lock Concurrency (Integration)', () => {
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

  it('deterministically proves advisory-lock contention and serializes same-company reconciliation without duplicates or aborts', async () => {
    // 1. Seed Workspace and Company
    const workspace = await prisma.workspace.create({
      data: { name: 'Advisory Lock Workspace' },
    });

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Advisory Corp',
        normalizedName: 'advisory corp',
        domain: 'advisory.com',
      },
    });

    const lockKey = `${workspace.id}:${company.id}`;
    const pool = getTestPgPool();

    const candidate: DiscoveredContactCandidate = {
      firstName: 'Elena',
      lastName: 'Rostova',
      title: 'Chief Operating Officer',
      email: 'elena@advisory.com',
      personKind: 'PERSON',
      confidence: 'HIGH',
      source: 'PUBLIC_WEB',
      sourceUrl: 'https://advisory.com/leadership',
      evidence: [
        {
          claim: 'Elena Rostova serves as Chief Operating Officer at Advisory Corp',
          sourceName: 'Advisory Leadership',
          sourceUrl: 'https://advisory.com/leadership',
          sourceExcerpt: 'Elena Rostova serves as Chief Operating Officer',
          classification: 'FACT',
          confidence: 'HIGH',
        },
      ],
    };

    // Barriers and synchronization flags
    let signalLockA!: () => void;
    const lockAPromise = new Promise<void>((resolve) => {
      signalLockA = resolve;
    });

    let continueA!: () => void;
    const allowACommitPromise = new Promise<void>((resolve) => {
      continueA = resolve;
    });

    let signalBStarted!: () => void;
    const bStartedPromise = new Promise<void>((resolve) => {
      signalBStarted = resolve;
    });

    let bAcquiredLock = false;

    // 2. Transaction A starts on its dedicated connection and acquires the company advisory lock
    const txAPromise = prisma.$transaction(async (txA) => {
      await txA.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      signalLockA();

      // Wait for observer Connection C to prove contention before committing
      await allowACommitPromise;

      return contactRepository.persistDiscoveredContacts(
        workspace.id,
        company.id,
        [candidate],
        txA,
      );
    });

    // Wait until Transaction A holds the advisory lock
    await lockAPromise;

    // 3. Transaction B starts on a separate connection and attempts the exact same advisory lock
    const txBPromise = prisma.$transaction(async (txB) => {
      signalBStarted();
      // This will remain blocked while Transaction A holds the lock
      await txB.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      bAcquiredLock = true;

      return contactRepository.persistDiscoveredContacts(
        workspace.id,
        company.id,
        [candidate],
        txB,
      );
    });

    await bStartedPromise;

    // 4. Observer Connection C deterministically proves Transaction A holds the advisory lock
    // and Transaction B is genuinely blocked (not just slow)
    const clientC = await pool.connect();
    try {
      await clientC.query('BEGIN');
      const cRes = await clientC.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
        [lockKey],
      );

      // PROOF: Lock acquisition MUST fail because Transaction A holds it
      expect(cRes.rows[0].acquired).toBe(false);
      // PROOF: Transaction B has NOT acquired the lock
      expect(bAcquiredLock).toBe(false);

      await clientC.query('ROLLBACK');
    } finally {
      clientC.release();
    }

    // 5. Release Transaction A barrier so it persists and commits
    continueA();
    const resultA = await txAPromise;
    expect(resultA.acceptedCount).toBe(1);
    expect(resultA.rejectedConflictCount).toBe(0);

    // 6. Transaction B unblocks, acquires lock, reconciles, and commits
    const resultB = await txBPromise;
    expect(resultB.acceptedCount).toBe(1);
    expect(resultB.rejectedConflictCount).toBe(0);
    expect(bAcquiredLock).toBe(true);

    // 7. Final database invariants verification
    // Exactly 1 Person row globally in workspace
    const persons = await prisma.person.findMany({
      where: {
        workspaceId: workspace.id,
        email: 'elena@advisory.com',
      },
    });
    expect(persons).toHaveLength(1);
    expect(persons[0].firstName).toBe('Elena');
    expect(persons[0].lastName).toBe('Rostova');

    // Exactly 1 PersonCompanyAssociation row for this company
    const associations = await prisma.personCompanyAssociation.findMany({
      where: {
        workspaceId: workspace.id,
        companyId: company.id,
      },
    });
    expect(associations).toHaveLength(1);
    expect(associations[0].personId).toBe(persons[0].id);
    expect(associations[0].role).toBe('Chief Operating Officer');

    // Exactly 1 Evidence row deduplicated and tied to the association
    const evidenceList = await prisma.evidence.findMany({
      where: {
        workspaceId: workspace.id,
        companyId: company.id,
      },
    });
    expect(evidenceList).toHaveLength(1);
    expect(evidenceList[0].companyAssociationId).toBe(associations[0].id);
  });
});
