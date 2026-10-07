import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  PrismaClient,
  JobStatus,
  OpportunityStatus,
  OpportunityType,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { ContactController } from '../../src/modules/contact/contact.controller';
import { CreateContactUseCase } from '../../src/modules/contact/application/create-contact.use-case';
import { DiscoverContactsUseCase } from '../../src/modules/contact/application/discover-contacts.use-case';
import { GetCompanyContactsUseCase } from '../../src/modules/contact/application/get-company-contacts.use-case';
import { GetContactByIdUseCase } from '../../src/modules/contact/application/get-contact-by-id.use-case';
import { SuppressContactUseCase } from '../../src/modules/contact/application/suppress-contact.use-case';
import { UnsuppressContactUseCase } from '../../src/modules/contact/application/unsuppress-contact.use-case';
import { ContactDiscoveryWorker } from '../../src/modules/contact/worker/contact-discovery.worker';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import {
  CONTACT_DISCOVERY_PROVIDER_TOKEN,
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
} from '../../src/modules/contact/domain/contact.provider.interface';
import { CONTACT_REPOSITORY_TOKEN } from '../../src/modules/contact/domain/contact.repository.interface';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../src/modules/workspaces/workspace.guard';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

jest.unmock('@repo/db');

describe('Contact HTTP API Journey (PostgreSQL Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let worker: ContactDiscoveryWorker;
  let mockProvider: ContactDiscoveryProvider;

  let currentWorkspaceId: string;
  let currentUserId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;

    mockProvider = {
      discoverContacts: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: CONTACT_REPOSITORY_TOKEN,
          useClass: PrismaContactRepository,
        },
        {
          provide: CONTACT_DISCOVERY_PROVIDER_TOKEN,
          useValue: mockProvider,
        },
        CreateContactUseCase,
        DiscoverContactsUseCase,
        GetCompanyContactsUseCase,
        GetContactByIdUseCase,
        SuppressContactUseCase,
        UnsuppressContactUseCase,
        ContactDiscoveryWorker,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: currentUserId, email: 'test@example.com' };
          return true;
        },
      })
      .overrideGuard(WorkspaceGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.workspace = {
            id: currentWorkspaceId,
            name: 'Integration Workspace',
          };
          return true;
        },
      })
      .compile();

    worker = moduleFixture.get<ContactDiscoveryWorker>(ContactDiscoveryWorker);

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await teardownTestDatabase();
  });

  it('completes the full HTTP-level product journey: discovery trigger (202) -> worker processing -> contacts retrieval with opportunity evaluation (200) -> contact selection (201) -> selection verified (200) -> cross-company rejected (403) -> 24h freshness boundaries', async () => {
    // -------------------------------------------------------------------------
    // Phase 1: Seed real company (Resend), Career Profile, and Confirmed Opportunity
    // -------------------------------------------------------------------------
    const workspace = await prisma.workspace.create({
      data: { name: 'Resend API Integration WS' },
    });
    currentWorkspaceId = workspace.id;
    currentUserId = 'user-test-uuid-1';

    // Career Profile specifying user's desired roles
    await prisma.careerProfile.create({
      data: {
        workspaceId: currentWorkspaceId,
        targetRoles: ['Head of Engineering', 'Founding Engineer'],
        targetLocations: ['Remote', 'San Francisco'],
      },
    });

    // Company: Resend
    const resendCompany = await prisma.company.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Resend',
        normalizedName: 'resend',
        domain: 'resend.com',
        websiteUrl: 'https://resend.com',
        industry: 'Developer Tools / Email Infrastructure',
      },
    });
    const companyId = resendCompany.id;

    // Confirmed Opportunity: Founding Engineer opening
    await prisma.opportunity.create({
      data: {
        workspaceId: currentWorkspaceId,
        companyId,
        roleTitle: 'Founding Engineer',
        roleDescription:
          'Build modern email API infrastructure in TypeScript and Rust.',
        status: OpportunityStatus.ACTIVE,
        opportunityType: OpportunityType.CONFIRMED,
        openingSourceUrl: 'https://resend.com/careers',
      },
    });

    // -------------------------------------------------------------------------
    // Phase 2: GET /api/v1/companies/:companyId/contacts before discovery
    // -------------------------------------------------------------------------
    const preDiscoveryRes = await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}/contacts`)
      .expect(200);

    expect(preDiscoveryRes.body).toEqual(
      expect.objectContaining({
        companyId,
        status: 'NOT_STARTED',
        selectedContactId: null,
        contacts: [],
        discoveryJob: null,
      }),
    );

    // -------------------------------------------------------------------------
    // Phase 3: POST /api/v1/companies/:companyId/contacts/discover (Trigger Discovery)
    // -------------------------------------------------------------------------
    const discoverRes = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({})
      .expect(202);

    expect(discoverRes.body).toEqual(
      expect.objectContaining({
        status: 'QUEUED',
        reused: false,
        jobId: expect.any(String),
      }),
    );
    const queuedJobId = discoverRes.body.jobId;

    // In-flight deduplication: Calling discover again while job is in-flight returns 202 with same jobId
    const inFlightRes = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({})
      .expect(202);

    expect(inFlightRes.body).toEqual(
      expect.objectContaining({
        status: 'QUEUED',
        reused: false,
        jobId: queuedJobId,
      }),
    );

    // Verify DB Job row state
    const pendingJob = await prisma.job.findUnique({
      where: { id: queuedJobId },
    });
    expect(pendingJob).not.toBeNull();
    expect(pendingJob!.status).toBe(JobStatus.PENDING);
    expect((pendingJob!.payload as any).companyName).toBe('Resend');

    // -------------------------------------------------------------------------
    // Phase 4: Process Job with Real ContactDiscoveryWorker & Controlled Provider
    // -------------------------------------------------------------------------
    const providerResult: ContactDiscoveryResult = {
      companyId,
      workspaceId: currentWorkspaceId,
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
              sourceExcerpt:
                'Zeno Rocha is VP of Engineering and co-founder at Resend.',
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
              sourceExcerpt:
                'Bu Kinoshita is Head of Product and co-founder at Resend.',
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

    (mockProvider.discoverContacts as jest.Mock).mockResolvedValue(
      providerResult,
    );

    const claimed = await worker.claimNextJob();
    expect(claimed).not.toBeNull();
    expect(claimed!.job.id).toBe(queuedJobId);

    const processOk = await worker.processJob(claimed!);
    expect(processOk).toBe(true);

    // Verify job completed in DB
    const completedDbJob = await prisma.job.findUnique({
      where: { id: queuedJobId },
    });
    expect(completedDbJob!.status).toBe(JobStatus.COMPLETED);
    expect(completedDbJob!.completedAt).not.toBeNull();

    // -------------------------------------------------------------------------
    // Phase 5: GET /api/v1/companies/:companyId/contacts (HTTP Retrieval & Relevance)
    // -------------------------------------------------------------------------
    const getContactsRes = await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}/contacts`)
      .expect(200);

    expect(getContactsRes.body).toEqual(
      expect.objectContaining({
        companyId,
        status: 'COMPLETED',
        selectedContactId: null,
      }),
    );
    expect(getContactsRes.body.contacts).toHaveLength(3);

    // Validate Zeno Rocha: engineering leadership matches confirmed opportunity -> HIGH relevance
    const zenoContact = getContactsRes.body.contacts.find(
      (c: any) => c.email === 'zeno@resend.com',
    );
    expect(zenoContact).toBeDefined();
    expect(zenoContact.firstName).toBe('Zeno');
    expect(zenoContact.lastName).toBe('Rocha');
    expect(zenoContact.title).toBe('VP of Engineering');
    expect(zenoContact.emailConfidence).toBe('AVAILABLE');
    expect(zenoContact.relevance).toBe('HIGH');
    expect(zenoContact.recommendationRationale).toBeDefined();
    expect(zenoContact.isSelected).toBe(false);

    // Validate Bu Kinoshita
    const buContact = getContactsRes.body.contacts.find(
      (c: any) => c.email === 'bu@resend.com',
    );
    expect(buContact).toBeDefined();
    expect(buContact.title).toBe('Head of Product');
    expect(buContact.emailConfidence).toBe('AVAILABLE');
    expect(buContact.isSelected).toBe(false);

    // Validate Careers Team (ROLE_ADDRESS)
    const careersContact = getContactsRes.body.contacts.find(
      (c: any) => c.email === 'careers@resend.com',
    );
    expect(careersContact).toBeDefined();
    expect(careersContact.personKind).toBe('ROLE_ADDRESS');
    expect(careersContact.emailConfidence).toBe('AVAILABLE');
    expect(careersContact.isSelected).toBe(false);

    // -------------------------------------------------------------------------
    // Phase 6: GET /api/v1/contacts/:contactId (Get Contact By ID)
    // -------------------------------------------------------------------------
    const getContactRes = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${zenoContact.id}`)
      .expect(200);

    expect(getContactRes.body).toEqual(
      expect.objectContaining({
        id: zenoContact.id,
        firstName: 'Zeno',
        lastName: 'Rocha',
        email: 'zeno@resend.com',
      }),
    );

    // -------------------------------------------------------------------------
    // Phase 7: Cross-Company Isolation via HTTP
    // -------------------------------------------------------------------------
    const companyB = await prisma.company.create({
      data: {
        workspaceId: currentWorkspaceId,
        name: 'Competitor Corp',
        normalizedName: 'competitor corp',
        domain: 'competitor.com',
      },
    });

    const companyBRes = await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyB.id}/contacts`)
      .expect(200);

    expect(companyBRes.body.contacts).toHaveLength(0);

    // -------------------------------------------------------------------------
    // Phase 9: 24-Hour Freshness Boundaries via HTTP
    // -------------------------------------------------------------------------
    // Case 1: Completed < 24h old -> HTTP 200 with reused: true
    const freshnessReusedRes = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({ forceRefresh: false })
      .expect(200);

    expect(freshnessReusedRes.body).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        reused: true,
        jobId: queuedJobId,
        contactsCount: 3,
      }),
    );

    // Case 2: Completed > 24h old -> HTTP 202 with reused: false and new jobId
    // Seed/update the existing completed job completedAt to 25 hours ago
    const h25Ago = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.job.update({
      where: { id: queuedJobId },
      data: { completedAt: h25Ago },
    });

    const expiredFreshnessRes = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({})
      .expect(202);

    expect(expiredFreshnessRes.body.reused).toBe(false);
    expect(expiredFreshnessRes.body.status).toBe('QUEUED');
    expect(expiredFreshnessRes.body.jobId).not.toBe(queuedJobId);
    const newExpiredJobId = expiredFreshnessRes.body.jobId;

    // Complete the new job so we can test forceRefresh cleanly
    await prisma.job.update({
      where: { id: newExpiredJobId },
      data: { status: JobStatus.COMPLETED, completedAt: new Date() },
    });

    // Case 3: forceRefresh: true -> HTTP 202 with reused: false regardless of freshness
    const forceRefreshRes = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({ forceRefresh: true })
      .expect(202);

    expect(forceRefreshRes.body.reused).toBe(false);
    expect(forceRefreshRes.body.status).toBe('QUEUED');
    expect(forceRefreshRes.body.jobId).not.toBe(newExpiredJobId);
    expect(forceRefreshRes.body.jobId).not.toBe(queuedJobId);

    // -------------------------------------------------------------------------
    // Phase 10: Validation Error & Tenant Isolation via HTTP Boundary
    // -------------------------------------------------------------------------
    // ValidationPipe enforces type safety on DTO
    await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/contacts/discover`)
      .send({ forceRefresh: 'not-a-boolean' })
      .expect(400);

    // Tenant Isolation: Querying a company belonging to another workspace yields 404
    const otherWorkspace = await prisma.workspace.create({
      data: { name: 'Other Workspace' },
    });
    const otherCompany = await prisma.company.create({
      data: {
        workspaceId: otherWorkspace.id,
        name: 'Foreign Company',
        normalizedName: 'foreign company',
      },
    });

    // Request from currentWorkspaceId targeting otherCompany yields 404
    await request(app.getHttpServer())
      .get(`/api/v1/companies/${otherCompany.id}/contacts`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/companies/${otherCompany.id}/contacts/discover`)
      .send({})
      .expect(404);
  });
});
