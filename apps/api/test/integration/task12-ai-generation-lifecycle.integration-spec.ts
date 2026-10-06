import {
  PrismaClient,
  OutreachStatus,
  AiGenerationStatus,
  JobStatus,
} from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaService } from '../../src/database/prisma.service';
import { CreateOutreachUseCase } from '../../src/modules/outreach/application/create-outreach.use-case';
import { UpdateDraftUseCase } from '../../src/modules/outreach/application/update-draft.use-case';
import { OutreachGenerationWorker } from '../../src/modules/outreach/worker/outreach-generation.worker';
import { TemplateEngineService } from '../../src/modules/template/domain/template-engine.service';
import { type AIProvider } from '../../src/modules/outreach/domain/ai-provider.interface';
import { randomUUID } from 'crypto';

jest.unmock('@repo/db');

describe('Task 12: AI Generation Lifecycle & Fencing Invariants (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let createOutreachUseCase: CreateOutreachUseCase;
  let updateDraftUseCase: UpdateDraftUseCase;
  let worker: OutreachGenerationWorker;
  let mockAiProvider: jest.Mocked<AIProvider>;

  let currentWorkspaceId: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    prismaService = prisma as unknown as PrismaService;
    const templateEngine = new TemplateEngineService();

    mockAiProvider = {
      complete: jest.fn(),
    };

    createOutreachUseCase = new CreateOutreachUseCase(prismaService, templateEngine);
    updateDraftUseCase = new UpdateDraftUseCase(prismaService);
    worker = new OutreachGenerationWorker(prismaService, mockAiProvider);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    jest.clearAllMocks();

    const ws = await prisma.workspace.create({
      data: { name: 'AI Generation Workspace' },
    });
    currentWorkspaceId = ws.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function seedContact(
    workspaceId: string,
    email: string,
    companyName: string,
    firstName: string,
    lastName: string,
  ) {
    const company = await prisma.company.create({
      data: {
        workspaceId,
        name: companyName,
        normalizedName: companyName.toLowerCase(),
        domain: `${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      },
    });

    const person = await prisma.person.create({
      data: { workspaceId, email, firstName, lastName },
    });

    const pca = await prisma.personCompanyAssociation.create({
      data: {
        workspaceId,
        personId: person.id,
        companyId: company.id,
        role: 'Chief Information Security Officer',
        workEmail: email,
        conversationState: 'NO_REPLY',
      },
    });

    return { company, person, pca };
  }

  it('1. Initializes AI generation in PENDING state and transitions to SUCCEEDED with generated content upon worker completion', async () => {
    const { pca } = await seedContact(
      currentWorkspaceId,
      'devon@cybersec.example.com',
      'CyberSec Labs',
      'Devon',
      'Miles',
    );

    // 1. Create Outreach with AI content source
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'AI',
        aiPromptContext: 'Emphasize zero-trust architecture transition',
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    // Assert initial durable PENDING state in PostgreSQL
    expect(outreachDto.aiGenerationStatus).toBe('PENDING');
    expect(outreachDto.draftVersion).toBe(0);

    const initialOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(initialOutreach.aiGenerationStatus).toBe(AiGenerationStatus.PENDING);
    expect(initialOutreach.status).toBe(OutreachStatus.DRAFT);
    expect(initialOutreach.draftVersion).toBe(0);

    // Assert Job enqueued in PostgreSQL
    const job = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'OUTREACH_GENERATION',
      },
    });
    expect(job.status).toBe(JobStatus.PENDING);

    // 2. Mock successful AI provider response
    mockAiProvider.complete.mockResolvedValueOnce({
      rawText: JSON.stringify({
        subject: 'Zero-Trust Architecture for CyberSec Labs',
        body: 'Hi Devon, noticed your security leadership at CyberSec Labs. Would love to discuss your zero-trust transition roadmap.',
      }),
      tokensUsed: 150,
      model: 'claude-3-7-sonnet',
    });

    // 3. Claim and process Job via OutreachGenerationWorker
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING },
    });

    const success = await worker.processJob(job.id);
    expect(success).toBe(true);

    // 4. Assert PostgreSQL state after generation: SUCCEEDED, subject & message filled
    const completedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(completedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SUCCEEDED);
    expect(completedOutreach.subject).toBe('Zero-Trust Architecture for CyberSec Labs');
    expect(completedOutreach.message).toContain('Hi Devon, noticed your security leadership at CyberSec Labs.');

    // Assert Job marked COMPLETED in PostgreSQL
    const completedJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(completedJob.status).toBe(JobStatus.COMPLETED);
    expect(completedJob.completedAt).not.toBeNull();
  });

  it('2. Transitions aiGenerationStatus to FAILED when AI provider experiences terminal failure', async () => {
    const { pca } = await seedContact(
      currentWorkspaceId,
      'rachel@cloudinfra.example.com',
      'CloudInfra Inc',
      'Rachel',
      'Green',
    );

    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'AI',
        aiPromptContext: 'Focus on multi-region reliability',
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    const job = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'OUTREACH_GENERATION',
      },
    });

    // Simulate final attempt failure (dead letter)
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.RUNNING,
        attemptCount: 3,
        maxAttempts: 3,
      },
    });

    mockAiProvider.complete.mockRejectedValueOnce(
      new Error('Permanent upstream AI provider error: Model unavailable'),
    );

    const success = await worker.processJob(job.id);
    expect(success).toBe(false);

    // Assert PostgreSQL status transitioned to FAILED
    const failedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(failedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.FAILED);

    const failedJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(failedJob.status).toBe(JobStatus.FAILED);
    expect(failedJob.lastError).toContain('Permanent upstream AI provider error');
  });

  it('3. Fences against stale completion (SKIPPED): in-flight manual edit preserves user draft and sets SKIPPED', async () => {
    const { pca } = await seedContact(
      currentWorkspaceId,
      'monica@chefops.example.com',
      'ChefOps Corp',
      'Monica',
      'Geller',
    );

    // 1. Create AI outreach
    const outreachDto = await createOutreachUseCase.execute(
      currentWorkspaceId,
      {
        personCompanyAssociationId: pca.id,
        contentSource: 'AI',
        maxFollowUps: 0,
      },
      randomUUID(),
    );

    const job = await prisma.job.findFirstOrThrow({
      where: {
        workspaceId: currentWorkspaceId,
        type: 'OUTREACH_GENERATION',
      },
    });

    // Mark job RUNNING with expectedDraftVersion = 0
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING },
    });

    // 2. User edits draft in flight before worker commits (draftVersion increments from 0 to 1)
    await updateDraftUseCase.execute({
      workspaceId: currentWorkspaceId,
      outreachId: outreachDto.id,
      subject: 'Human Authored Subject: Urgent Kitchen Ops',
      message: 'Hello Monica, writing this personally while AI was generating.',
    });

    const editedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(editedOutreach.draftVersion).toBe(1);
    expect(editedOutreach.subject).toBe('Human Authored Subject: Urgent Kitchen Ops');

    // 3. AI provider returns stale draft
    mockAiProvider.complete.mockResolvedValueOnce({
      rawText: JSON.stringify({
        subject: 'Stale AI Subject That Must NOT Overwrite',
        body: 'Stale AI Body That Must NOT Overwrite',
      }),
      tokensUsed: 100,
      model: 'claude-3-7-sonnet',
    });

    // 4. Worker executes and detects draftVersion mismatch (expected 0, current 1)
    const success = await worker.processJob(job.id);
    expect(success).toBe(true);

    // 5. Assert PostgreSQL invariants:
    // - aiGenerationStatus: SKIPPED
    // - Human edits strictly preserved (NOT overwritten by stale AI response)
    const preservedOutreach = await prisma.outreach.findUniqueOrThrow({
      where: { id: outreachDto.id },
    });
    expect(preservedOutreach.aiGenerationStatus).toBe(AiGenerationStatus.SKIPPED);
    expect(preservedOutreach.subject).toBe('Human Authored Subject: Urgent Kitchen Ops');
    expect(preservedOutreach.message).toBe('Hello Monica, writing this personally while AI was generating.');

    // Job marked COMPLETED with lastError = SKIPPED_DRAFT_MODIFIED
    const completedJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(completedJob.status).toBe(JobStatus.COMPLETED);
    expect(completedJob.lastError).toBe('SKIPPED_DRAFT_MODIFIED');
  });
});
