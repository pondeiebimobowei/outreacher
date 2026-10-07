import { PrismaClient, JobStatus, OpportunityStatus, OpportunityType } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { DiscoverContactsUseCase } from '../../src/modules/contact/application/discover-contacts.use-case';
import { GetCompanyContactsUseCase } from '../../src/modules/contact/application/get-company-contacts.use-case';
import { ContactDiscoveryWorker } from '../../src/modules/contact/worker/contact-discovery.worker';
import {
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
  ContactDiscoveryInput,
} from '../../src/modules/contact/domain/contact.provider.interface';
import { AppForbiddenException } from '../../src/common/errors/application.exception';

describe('Contact End-to-End Journey (Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let contactRepository: PrismaContactRepository;
  let discoverUseCase: DiscoverContactsUseCase;
  let getContactsUseCase: GetCompanyContactsUseCase;
  let worker: ContactDiscoveryWorker;
  let mockProvider: ContactDiscoveryProvider;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    contactRepository = new PrismaContactRepository(prismaService);
    discoverUseCase = new DiscoverContactsUseCase(prismaService);
    getContactsUseCase = new GetCompanyContactsUseCase(
      prismaService,
      contactRepository,
    );

    mockProvider = {
      discoverContacts: jest.fn(),
    };

    worker = new ContactDiscoveryWorker(
      prismaService,
      mockProvider,
      contactRepository,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('completes the full real-company journey: discovery trigger -> worker persistence -> contact exposure with opportunity evaluation -> selection', async () => {
    // -------------------------------------------------------------------------
    // Phase 1: Seed real company (Resend), Career Profile, and Confirmed Opportunity
    // -------------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: 'Resend Career Outreach WS' },
    });
    const workspaceId = workspace.id;

    // Career Profile specifying user's desired roles
    await prisma.careerProfile.create({
      data: {
        workspaceId,
        targetRoles: ['Head of Engineering', 'Founding Engineer'],
        targetLocations: ['Remote', 'San Francisco'],
      },
    });

    // Company: Resend
    const resendCompany = await prisma.company.create({
      data: {
        workspaceId,
        name: 'Resend',
        normalizedName: 'resend',
        domain: 'resend.com',
        websiteUrl: 'https://resend.com',
        industry: 'Developer Tools / Email Infrastructure',
      },
    });
    const companyId = resendCompany.id;

    // Confirmed Opportunity: Founding Engineer opening detected during company research
    await prisma.opportunity.create({
      data: {
        workspaceId,
        companyId,
        roleTitle: 'Founding Engineer',
        roleDescription: 'Build modern email API infrastructure in TypeScript and Rust.',
        status: OpportunityStatus.ACTIVE,
        opportunityType: OpportunityType.CONFIRMED,
        openingSourceUrl: 'https://resend.com/careers',
      },
    });

    // Verify initial exposure state before discovery
    const initialView = await getContactsUseCase.execute(workspaceId, companyId);
    expect(initialView.status).toBe('NOT_STARTED');
    expect(initialView.contacts).toHaveLength(0);
    expect(initialView.selectedContactId).toBeNull();

    // -------------------------------------------------------------------------
    // Phase 2: Trigger Discovery from NestJS Workflow (DiscoverContactsUseCase)
    // -------------------------------------------------------------------------
    const triggerResult = await discoverUseCase.execute(workspaceId, companyId);
    expect(triggerResult.status).toBe('QUEUED');
    expect(triggerResult.reused).toBe(false);
    expect(triggerResult.jobId).toBeDefined();

    // Invariant Check: Calling discoverContacts again while job is in-flight deduplicates to same job
    const inFlightDedup = await discoverUseCase.execute(workspaceId, companyId);
    expect(inFlightDedup.jobId).toBe(triggerResult.jobId);
    expect(inFlightDedup.status).toBe('QUEUED');
    expect(inFlightDedup.reused).toBe(false);

    // Verify job in database is PENDING with correct payload
    const pendingJob = await prisma.job.findUnique({
      where: { id: triggerResult.jobId },
    });
    expect(pendingJob).not.toBeNull();
    expect(pendingJob!.status).toBe(JobStatus.PENDING);
    expect((pendingJob!.payload as any).companyName).toBe('Resend');
    expect((pendingJob!.payload as any).domain).toBe('resend.com');

    // -------------------------------------------------------------------------
    // Phase 3: Worker Claims and Executes Job (ContactDiscoveryWorker)
    // -------------------------------------------------------------------------
    // Mock the verified provider envelope matching Python pipeline discovery output for Resend
    const providerResult: ContactDiscoveryResult = {
      companyId,
      workspaceId,
      discoveredAt: new Date(),
      status: 'COMPLETED',
      candidates: [
        {
          personKind: 'PERSON',
          firstName: 'Zeno',
          lastName: 'Rocha',
          title: 'VP of Engineering',
          email: 'zeno@resend.com',
          confidence: 'HIGH',
          source: 'Company Website',
          sourceUrl: 'https://resend.com/about',
          evidence: [
            {
              claim: 'Zeno Rocha leads engineering at Resend',
              sourceName: 'Company Website',
              sourceUrl: 'https://resend.com/about',
              sourceExcerpt: 'Zeno Rocha is VP of Engineering and co-founder at Resend.',
              classification: 'FACT',
              confidence: 'HIGH',
            },
          ],
        },
        {
          personKind: 'PERSON',
          firstName: 'Bu',
          lastName: 'Kinoshita',
          title: 'Head of Product',
          email: 'bu@resend.com',
          confidence: 'HIGH',
          source: 'Company Website',
          sourceUrl: 'https://resend.com/about',
          evidence: [
            {
              claim: 'Bu Kinoshita leads product at Resend',
              sourceName: 'Company Website',
              sourceUrl: 'https://resend.com/about',
              sourceExcerpt: 'Bu Kinoshita is Head of Product and co-founder at Resend.',
              classification: 'FACT',
              confidence: 'HIGH',
            },
          ],
        },
        {
          personKind: 'ROLE_ADDRESS',
          firstName: 'Careers',
          lastName: 'Team',
          title: 'Recruiting Inquiries',
          email: 'careers@resend.com',
          confidence: 'HIGH',
          source: 'Company Careers Page',
          sourceUrl: 'https://resend.com/careers',
          evidence: [
            {
              claim: 'Careers email for direct inquiries',
              sourceName: 'Company Careers Page',
              sourceUrl: 'https://resend.com/careers',
              sourceExcerpt: 'Contact our hiring team at careers@resend.com.',
              classification: 'FACT',
              confidence: 'HIGH',
            },
          ],
        },
      ],
      unknowns: [],
      metadata: {
        homepage_extractions: 23,
        bundle_secondary_extractions: 87,
        candidate_page_extractions: 0,
      },
    };

    (mockProvider.discoverContacts as jest.Mock).mockResolvedValue(providerResult);

    // 1. Worker atomically claims next pending job
    const claimed = await worker.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed!.job.id).toBe(triggerResult.jobId);
    expect(claimed!.claimedAttempt).toBe(1);

    // Verify job status advanced to RUNNING in database
    const runningJob = await prisma.job.findUnique({
      where: { id: triggerResult.jobId },
    });
    expect(runningJob!.status).toBe(JobStatus.RUNNING);

    // 2. Worker executes job, invokes provider, sanitizes, deduplicates, and commits in transaction
    const processOk = await worker.processJob(claimed!);
    expect(processOk).toBe(true);

    // -------------------------------------------------------------------------
    // Phase 4: Database Persistence Verification
    // -------------------------------------------------------------------------
    // Job completed successfully
    const completedJob = await prisma.job.findUnique({
      where: { id: triggerResult.jobId },
    });
    expect(completedJob!.status).toBe(JobStatus.COMPLETED);
    expect(completedJob!.completedAt).not.toBeNull();
    expect((completedJob!.payload as any).contactsDiscoveredCount).toBe(3);

    // 3 Person rows exist in PostgreSQL
    const persons = await prisma.person.findMany({
      where: { workspaceId },
      orderBy: { email: 'asc' },
    });
    expect(persons).toHaveLength(3);

    const emails = persons.map((p) => p.email);
    expect(emails).toContain('zeno@resend.com');
    expect(emails).toContain('bu@resend.com');
    expect(emails).toContain('careers@resend.com');

    // 3 PersonCompanyAssociation rows exist, scoped to Resend
    const associations = await prisma.personCompanyAssociation.findMany({
      where: { workspaceId, companyId },
    });
    expect(associations).toHaveLength(3);

    // Evidence records created and linked to association
    const evidenceList = await prisma.evidence.findMany({
      where: { workspaceId, companyId },
    });
    expect(evidenceList.length).toBeGreaterThanOrEqual(3);
    for (const ev of evidenceList) {
      expect(ev.companyAssociationId).toBeDefined();
      expect(ev.classification).toBe('FACT');
    }

    // -------------------------------------------------------------------------
    // Phase 5: Expose Contacts through Existing Contact/Opportunity Flow
    // -------------------------------------------------------------------------
    const exposedView = await getContactsUseCase.execute(workspaceId, companyId);
    expect(exposedView.status).toBe('COMPLETED');
    expect(exposedView.contacts).toHaveLength(3);
    expect(exposedView.selectedContactId).toBeNull();

    // Verify relevance evaluation against confirmed opportunity ('Founding Engineer')
    const zenoDto = exposedView.contacts.find((c) => c.email === 'zeno@resend.com')!;
    expect(zenoDto).toBeDefined();
    expect(zenoDto.firstName).toBe('Zeno');
    expect(zenoDto.lastName).toBe('Rocha');
    expect(zenoDto.title).toBe('VP of Engineering');
    expect(zenoDto.emailConfidence).toBe('AVAILABLE');
    // Engineering leadership title matching confirmed engineering opportunity gets HIGH relevance
    expect(zenoDto.relevance).toBe('HIGH');
    expect(zenoDto.recommendationRationale).toBeDefined();
    expect(zenoDto.isSelected).toBe(false);

    const buDto = exposedView.contacts.find((c) => c.email === 'bu@resend.com')!;
    expect(buDto).toBeDefined();
    expect(buDto.title).toBe('Head of Product');
    expect(buDto.emailConfidence).toBe('AVAILABLE');
    expect(buDto.isSelected).toBe(false);

    // -------------------------------------------------------------------------
    // Phase 6: Verify Discovered Contacts & PCA Associations
    // -------------------------------------------------------------------------
    const pcaCount = await prisma.personCompanyAssociation.count({
      where: { workspaceId, companyId },
    });
    expect(pcaCount).toBe(3);

    // -------------------------------------------------------------------------
    // Phase 7: Tenant & Company Boundary Invariants
    // -------------------------------------------------------------------------
    // Create Company B in same workspace
    const companyB = await prisma.company.create({
      data: {
        workspaceId,
        name: 'Competitor Corp',
        normalizedName: 'competitor corp',
        domain: 'competitor.com',
      },
    });

    // Company B has no contacts associated with it
    const companyBView = await getContactsUseCase.execute(
      workspaceId,
      companyB.id,
    );
    expect(companyBView.contacts).toHaveLength(0);

    // -------------------------------------------------------------------------
    // Phase 8: 24-Hour Freshness Reuse & Force Refresh Invariants
    // -------------------------------------------------------------------------
    // Calling discoverContacts again within 24h reuses the completed discovery job
    const freshReused = await discoverUseCase.execute(workspaceId, companyId);
    expect(freshReused.status).toBe('COMPLETED');
    expect(freshReused.reused).toBe(true);
    expect(freshReused.jobId).toBe(triggerResult.jobId);
    expect(freshReused.contactsCount).toBe(3);

    // Forced refresh bypasses cache and creates a new job
    const forcedRefresh = await discoverUseCase.execute(
      workspaceId,
      companyId,
      { forceRefresh: true },
    );
    expect(forcedRefresh.status).toBe('QUEUED');
    expect(forcedRefresh.reused).toBe(false);
    expect(forcedRefresh.jobId).not.toBe(triggerResult.jobId);
  });
});
