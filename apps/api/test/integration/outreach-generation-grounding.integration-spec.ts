import {
  PrismaClient,
  OpportunityStatus,
  OpportunityType,
  EvidenceClassification,
  OutreachStatus,
  AiGenerationStatus,
  JobStatus,
  PersonKind,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { OutreachGenerationWorker } from '../../src/modules/outreach/worker/outreach-generation.worker';
import { type AIProvider } from '../../src/modules/outreach/domain/ai-provider.interface';
import { UpdateDraftUseCase } from '../../src/modules/outreach/application/update-draft.use-case';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Grounded Outreach Generation & Human Review Integration (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let worker: OutreachGenerationWorker;
  let updateDraftUseCase: UpdateDraftUseCase;
  let mockAiProvider: jest.Mocked<AIProvider>;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    mockAiProvider = {
      complete: jest.fn(),
    };
    worker = new OutreachGenerationWorker(prismaService, mockAiProvider);
    updateDraftUseCase = new UpdateDraftUseCase(prismaService);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('1. Grounded Context Assembly: respects tenant isolation and links selectedOpportunityId + companyAssociation evidence', async () => {
    // Setup Workspace A
    const wsA = await prisma.workspace.create({ data: { name: 'Workspace A' } });
    await prisma.careerProfile.create({
      data: {
        workspaceId: wsA.id,
        headline: 'Staff Distributed Systems Engineer',
        summary: 'Specializing in high-throughput streaming systems',
        targetRoles: ['Staff Engineer', 'Principal Engineer'],
        skills: ['TypeScript', 'Rust', 'Kafka'],
      },
    });

    const companyA = await prisma.company.create({
      data: {
        workspaceId: wsA.id,
        name: 'Alpha Stream Inc',
        normalizedName: 'alpha stream inc',
        domain: 'alphastream.io',
      },
    });

    const personA = await prisma.person.create({
      data: {
        workspaceId: wsA.id,
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah@alphastream.io',
        personKind: PersonKind.PERSON,
      },
    });

    const pcaA = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId: wsA.id,
        personId: personA.id,
        companyId: companyA.id,
        role: 'VP of Engineering',
        workEmail: 'sarah@alphastream.io',
      },
    });

    const oppA = await prisma.opportunity.create({
      data: {
        workspaceId: wsA.id,
        companyId: companyA.id,
        opportunityType: OpportunityType.CONFIRMED,
        roleTitle: 'Staff Distributed Systems Engineer',
        roleDescription: 'Leading real-time event streaming platform team',
        status: OpportunityStatus.ACTIVE,
      },
    });

    // Evidence for PCA A linked directly to oppA
    await prisma.evidence.create({
      data: {
        workspaceId: wsA.id,
        companyId: companyA.id,
        companyAssociationId: pcaA.id,
        opportunityId: oppA.id,
        claim: 'Alpha Stream expanded cluster from 100 to 500 nodes',
        classification: EvidenceClassification.FACT,
        sourceName: 'Tech Blog',
        sourceUrl: 'https://alphastream.io/blog/scaling',
        sourceExcerpt: 'We expanded our production Kafka cluster to 500 nodes.',
      },
    });

    // Foreign Workspace B with evidence that must NEVER leak
    const wsB = await prisma.workspace.create({ data: { name: 'Workspace B' } });
    const companyB = await prisma.company.create({
      data: {
        workspaceId: wsB.id,
        name: 'Beta Cloud Corp',
        normalizedName: 'beta cloud corp',
        domain: 'betacloud.com',
      },
    });
    const personB = await prisma.person.create({
      data: {
        workspaceId: wsB.id,
        firstName: 'John',
        lastName: 'Doe',
        personKind: PersonKind.PERSON,
      },
    });
    const pcaB = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId: wsB.id,
        personId: personB.id,
        companyId: companyB.id,
        role: 'CTO',
      },
    });
    await prisma.evidence.create({
      data: {
        workspaceId: wsB.id,
        companyId: companyB.id,
        companyAssociationId: pcaB.id,
        claim: 'LEAKED EVIDENCE: Beta Cloud proprietary secret',
        classification: EvidenceClassification.FACT,
        sourceName: 'Leak',
      },
    });

    // Campaign and Recipient in Workspace A with selectedOpportunityId
    const campaignA = await prisma.campaign.create({
      data: {
        workspaceId: wsA.id,
        name: 'Campaign A',
      },
    });

    const recipientA = await prisma.campaignRecipient.create({
      data: {
        workspaceId: wsA.id,
        campaignId: campaignA.id,
        personCompanyAssociationId: pcaA.id,
        selectedOpportunityId: oppA.id,
      },
    });

    const outreachA = await prisma.outreach.create({
      data: {
        workspaceId: wsA.id,
        personCompanyAssociationId: pcaA.id,
        campaignRecipientId: recipientA.id,
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const jobA = await prisma.job.create({
      data: {
        workspaceId: wsA.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        payload: {
          outreachId: outreachA.id,
          expectedDraftVersion: 0,
        },
      },
    });

    // Mock AI response
    mockAiProvider.complete.mockImplementation(async (request) => {
      // Invariant assertions on the built prompt
      expect(request.userPrompt).toContain('Alpha Stream Inc');
      expect(request.userPrompt).toContain('Sarah Connor');
      expect(request.userPrompt).toContain('Staff Distributed Systems Engineer');
      expect(request.userPrompt).toContain('Alpha Stream expanded cluster from 100 to 500 nodes');
      expect(request.userPrompt).toContain('https://alphastream.io/blog/scaling');
      expect(request.userPrompt).toContain('We expanded our production Kafka cluster to 500 nodes.');
      // Ensure Workspace B content NEVER leaked into Workspace A prompt
      expect(request.userPrompt).not.toContain('LEAKED EVIDENCE');
      expect(request.userPrompt).not.toContain('Beta Cloud Corp');

      return {
        rawText: JSON.stringify({
          subject: 'Staff Distributed Systems role at Alpha Stream',
          body: 'Hi Sarah, noticed the Staff Distributed Systems Engineer opening and wanted to reach out regarding your cluster scaling milestones.',
        }),
      };
    });

    const processed = await worker.processJob(jobA.id);
    expect(processed).toBe(true);

    const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachA.id },
    });
    expect(updatedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SUCCEEDED);
    expect(updatedOutreach.subject).toBe('Staff Distributed Systems role at Alpha Stream');
    expect(updatedOutreach.status).toBe(OutreachStatus.DRAFT); // Retains DRAFT for human review
    expect(updatedOutreach.outreachReason).toContain('verified opening evidence');

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobA.id },
    });
    expect(updatedJob.status).toBe(JobStatus.COMPLETED);
  });

  it('2. Opportunity Selection Fallback: unlinked outreach defaults strictly to UNCLASSIFIED without hiring claims', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Direct Outreach WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Gamma Systems',
        normalizedName: 'gamma systems',
        domain: 'gamma.com',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Alex', lastName: 'Smith', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id, role: 'Engineering Lead' },
    });

    // Outreach without campaignRecipient (Direct outreach)
    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    mockAiProvider.complete.mockImplementation(async (request) => {
      // Must NOT claim open role
      expect(request.userPrompt).toContain('Opportunity Type: UNCLASSIFIED');
      expect(request.userPrompt).toContain('without hiring assertions');

      return {
        rawText: JSON.stringify({
          subject: 'Connecting with Gamma Systems engineering',
          body: 'Hi Alex, I have been following Gamma Systems and wanted to connect regarding engineering architecture.',
        }),
      };
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(true);

    const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(updatedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SUCCEEDED);
    expect(updatedOutreach.outreachReason).toContain('Exploring general engineering fit');
    expect(updatedOutreach.status).toBe(OutreachStatus.DRAFT);
  });

  it('3. Semantic Opening Evidence: CONFIRMED opportunity with UNRELATED company evidence does NOT claim verified opening evidence', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Unrelated Evidence WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Sigma Logistics',
        normalizedName: 'sigma logistics',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Liam', lastName: 'Neeson', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id, role: 'VP Operations' },
    });

    const opp = await prisma.opportunity.create({
      data: {
        workspaceId: ws.id,
        companyId: company.id,
        opportunityType: OpportunityType.CONFIRMED,
        roleTitle: 'Principal Platform Architect',
        status: OpportunityStatus.ACTIVE,
      },
    });

    // Evidence for PCA is attached, but opportunityId is NULL (general company fact, not role/opening evidence!)
    await prisma.evidence.create({
      data: {
        workspaceId: ws.id,
        companyId: company.id,
        companyAssociationId: pca.id,
        opportunityId: null, // NOT linked to opp.id
        claim: 'Sigma Logistics raised Series B funding',
        classification: EvidenceClassification.FACT,
        sourceName: 'Press Release',
      },
    });

    const campaign = await prisma.campaign.create({
      data: { workspaceId: ws.id, name: 'Campaign Unrelated' },
    });
    const recipient = await prisma.campaignRecipient.create({
      data: {
        workspaceId: ws.id,
        campaignId: campaign.id,
        personCompanyAssociationId: pca.id,
        selectedOpportunityId: opp.id,
      },
    });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        campaignRecipientId: recipient.id,
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    mockAiProvider.complete.mockResolvedValueOnce({
      rawText: JSON.stringify({
        subject: 'Principal Platform Architect role at Sigma Logistics',
        body: 'Hi Liam, reaching out regarding the Principal Platform Architect position.',
      }),
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(true);

    const updatedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(updatedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SUCCEEDED);
    expect(updatedOutreach.outreachReason).toContain('confirmed open role Principal Platform Architect');
    // Critical semantic invariant: MUST NOT claim verified opening evidence because evidence has no opportunity link!
    expect(updatedOutreach.outreachReason).not.toContain('verified opening evidence');
  });

  it('4. Concurrency Lease Fencing: Stale worker loses lease at commit boundary and commits ZERO side-effects', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Lease Fencing WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Delta Logic',
        normalizedName: 'delta logic',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Dave', lastName: 'Miller', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id },
    });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        subject: 'Initial Unmodified Subject',
        message: 'Initial Unmodified Message',
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        leaseVersion: 1,
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    // Simulate AI completion returning after another recovery/worker advanced the lease
    mockAiProvider.complete.mockImplementation(async () => {
      // While AI is generating, lease is bumped from 1 to 2 by recovery worker
      await prisma.job.update({
        where: { id: job.id },
        data: { leaseVersion: 2 },
      });

      return {
        rawText: JSON.stringify({
          subject: 'Stale Worker Rogue Subject',
          body: 'Stale Worker Rogue Message that must never be persisted.',
        }),
      };
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(false);

    // Assert that Stale Worker wrote ZERO changes to Outreach
    const preservedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(preservedOutreach.subject).toBe('Initial Unmodified Subject');
    expect(preservedOutreach.message).toBe('Initial Unmodified Message');
    expect(preservedOutreach.aiGenerationStatus).toBeNull();
    expect(preservedOutreach.draftVersion).toBe(0);
    expect(preservedOutreach.status).toBe(OutreachStatus.DRAFT);

    // Assert Job remained with newer leaseVersion (leaseVersion 2 not overwritten)
    const preservedJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(preservedJob.leaseVersion).toBe(2);
    expect(preservedJob.status).toBe(JobStatus.RUNNING);
    expect(preservedJob.completedAt).toBeNull();
  });

  it('5. Dead-Letter Fencing: Stale worker reaching max attempts cannot set Outreach to FAILED when lease is lost', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Dead Letter Lease WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Theta Corp',
        normalizedName: 'theta corp',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Tina', lastName: 'Fey', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id },
    });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        attemptCount: 3,
        maxAttempts: 3,
        leaseVersion: 1,
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    // Simulate AI failing permanently AFTER lease is stolen
    mockAiProvider.complete.mockImplementation(async () => {
      // Lease stolen
      await prisma.job.update({
        where: { id: job.id },
        data: { leaseVersion: 2 },
      });
      throw new Error('Fatal AI connection error');
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(false);

    // Assert Outreach.aiGenerationStatus is NOT mutated to FAILED by stale dead-letter worker
    const preservedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(preservedOutreach.aiGenerationStatus).toBeNull();

    // Assert Job remains at leaseVersion 2 and was not transitioned to FAILED by stale worker
    const preservedJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(preservedJob.leaseVersion).toBe(2);
    expect(preservedJob.status).toBe(JobStatus.RUNNING);
  });

  it('6. Concurrent Manual Edit: User edits draft before AI completes; preserves user edits and sets SKIPPED', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Draft Race WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Epsilon Tech',
        normalizedName: 'epsilon tech',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Eva', lastName: 'Rostova', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id },
    });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    // In flight, user edits the draft
    await updateDraftUseCase.execute({
      workspaceId: ws.id,
      outreachId: outreach.id,
      subject: 'Human Handcrafted Subject',
      message: 'Human Handcrafted Content',
    });

    mockAiProvider.complete.mockResolvedValueOnce({
      rawText: JSON.stringify({
        subject: 'AI Overwrite Attempt',
        body: 'AI Overwrite Attempt Message',
      }),
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(true);

    const finalOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(finalOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SKIPPED);
    expect(finalOutreach.subject).toBe('Human Handcrafted Subject');
    expect(finalOutreach.message).toBe('Human Handcrafted Content');
    expect(finalOutreach.draftVersion).toBe(1);
    expect(finalOutreach.status).toBe(OutreachStatus.DRAFT);
  });

  it('7. Strict Domain Validation: Invalid/Unbacked AI output fails without fallback and leaves draft unpolluted', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Validation Fail WS' } });
    const company = await prisma.company.create({
      data: {
        workspaceId: ws.id,
        name: 'Zeta Labs',
        normalizedName: 'zeta labs',
      },
    });
    const person = await prisma.person.create({
      data: { workspaceId: ws.id, firstName: 'Zack', lastName: 'Morris', personKind: PersonKind.PERSON },
    });
    const pca = await prisma.personCompanyAssociation.create({
      data: { workspaceId: ws.id, personId: person.id, companyId: company.id },
    });

    const outreach = await prisma.outreach.create({
      data: {
        workspaceId: ws.id,
        personCompanyAssociationId: pca.id,
        subject: '',
        message: '',
        status: OutreachStatus.DRAFT,
        draftVersion: 0,
      },
    });

    const job = await prisma.job.create({
      data: {
        workspaceId: ws.id,
        type: 'OUTREACH_GENERATION',
        status: JobStatus.RUNNING,
        idempotencyKey: randomUUID(),
        attemptCount: 1,
        maxAttempts: 3,
        payload: {
          outreachId: outreach.id,
          expectedDraftVersion: 0,
        },
      },
    });

    // AI claims unbacked job posting for UNCLASSIFIED opportunity!
    mockAiProvider.complete.mockResolvedValueOnce({
      rawText: JSON.stringify({
        subject: 'Regarding your open role',
        body: 'Hi Zack, I saw your job posting for engineer and wanted to apply.',
      }),
    });

    const processed = await worker.processJob(job.id);
    expect(processed).toBe(false);

    // Invariants:
    // 1. Outreach content remains blank
    const cleanOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreach.id },
    });
    expect(cleanOutreach.subject).toBe('');
    expect(cleanOutreach.message).toBe('');

    // 2. Job scheduled for retry with PENDING status and error recorded
    const retryingJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(retryingJob.status).toBe(JobStatus.PENDING);
    expect(retryingJob.lastError).toContain('AI draft contains illegal opening claim');
  });
});
