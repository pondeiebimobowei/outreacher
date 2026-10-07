import { PrismaClient, JobStatus } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { ContactDiscoveryWorker } from '../../src/modules/contact/worker/contact-discovery.worker';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import {
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
} from '../../src/modules/contact/domain/contact.provider.interface';
import { PrismaService } from '../../src/database/prisma.service';

describe('Contact Lease Fencing (Integration)', () => {
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

  it('prevents stale worker from committing completion or persisting rows when lease generation is bumped', async () => {
    // 1. Seed Workspace, Company, and Job
    const workspace = await prisma.workspace.create({
      data: { name: 'Fencing Workspace' },
    });

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Fencing Corp',
        normalizedName: 'fencing corp',
        domain: 'fencing.com',
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: workspace.id,
        type: 'CONTACT_DISCOVERY',
        status: JobStatus.PENDING,
        attemptCount: 0,
        availableAt: new Date(Date.now() - 1000),
        idempotencyKey: `discovery:${company.id}:${Date.now()}`,
        payload: {
          companyId: company.id,
          companyName: company.name,
          domain: company.domain,
        },
      },
    });

    const mockProvider: ContactDiscoveryProvider = {
      discoverContacts: jest.fn().mockImplementation(async () => {
        const result: ContactDiscoveryResult = {
          companyId: company.id,
          workspaceId: workspace.id,
          discoveredAt: new Date(),
          candidates: [
            {
              firstName: 'Slow',
              lastName: 'Worker',
              title: 'VP Engineering',
              email: 'slow@fencing.com',
              personKind: 'PERSON',
              confidence: 'HIGH',
              source: 'PUBLIC_WEB',
              sourceUrl: 'https://fencing.com/team',
            },
          ],
        };
        return result;
      }),
    };

    const worker = new ContactDiscoveryWorker(
      prismaService,
      mockProvider,
      contactRepository,
    );

    // 2. Worker claims job (attemptCount = 1)
    const claimed = await worker.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed?.claimedAttempt).toBe(1);
    expect(claimed?.job.id).toBe(job.id);

    // 3. Out-of-band: Simulate stale job recovery bumping attemptCount to 2 and resetting to PENDING
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PENDING,
        attemptCount: 2,
        lastError: 'STALE_LEASE_RECLAIMED',
      },
    });

    // 4. Stale worker finishes provider call and attempts processJob
    const processed = await worker.processJob(claimed!);
    expect(processed).toBe(false);

    // 5. Verify zero contact rows, associations, or evidence were committed by the stale worker
    const personsCount = await prisma.person.count({
      where: { workspaceId: workspace.id },
    });
    expect(personsCount).toBe(0);

    const associationsCount = await prisma.personCompanyAssociation.count({
      where: { workspaceId: workspace.id },
    });
    expect(associationsCount).toBe(0);

    const evidenceCount = await prisma.evidence.count({
      where: { workspaceId: workspace.id },
    });
    expect(evidenceCount).toBe(0);

    // 6. Verify job status remains PENDING with attemptCount = 2 (not overwritten by stale worker)
    // and side-effect fields (completedAt, contactsDiscoveredCount, unknowns) were NOT mutated
    const jobAfterStale = await prisma.job.findUnique({
      where: { id: job.id },
    });
    expect(jobAfterStale?.status).toBe(JobStatus.PENDING);
    expect(jobAfterStale?.attemptCount).toBe(2);
    expect(jobAfterStale?.completedAt).toBeNull();
    const stalePayload = jobAfterStale?.payload as Record<string, unknown> | null;
    expect(stalePayload?.contactsDiscoveredCount).toBeUndefined();
    expect(stalePayload?.unknowns).toBeUndefined();

    // 7. Legitimate replacement worker claims attemptCount = 3 and succeeds
    const replacementClaim = await worker.claimNextJob();
    expect(replacementClaim).not.toBeNull();
    expect(replacementClaim?.claimedAttempt).toBe(3);

    const replacementProcessed = await worker.processJob(replacementClaim!);
    expect(replacementProcessed).toBe(true);

    // 8. Assert successful completion and exact persistence
    const jobFinal = await prisma.job.findUnique({
      where: { id: job.id },
    });
    expect(jobFinal?.status).toBe(JobStatus.COMPLETED);
    expect(jobFinal?.attemptCount).toBe(3);

    const personsFinal = await prisma.person.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(personsFinal).toHaveLength(1);
    expect(personsFinal[0].email).toBe('slow@fencing.com');
  });
});
