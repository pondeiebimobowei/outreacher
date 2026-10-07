import { OutreachGenerationWorker } from './outreach-generation.worker';
import { OpportunityType, PersonKind } from '@repo/db';

describe('OutreachGenerationWorker', () => {
  let worker: OutreachGenerationWorker;
  let prisma: any;
  let aiProvider: any;

  const mockJob = {
    id: 'job-1',
    workspaceId: 'ws-123',
    type: 'OUTREACH_GENERATION',
    status: 'RUNNING',
    attemptCount: 1,
    maxAttempts: 3,
    leaseVersion: 1,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    payload: {
      outreachId: 'out-1',
      expectedDraftVersion: 0,
    },
  };

  const mockOutreach = {
    id: 'out-1',
    workspaceId: 'ws-123',
    draftVersion: 0,
    aiPromptContext: 'Focus on CFO value and 30-day ROI',
    subject: '',
    message: '',
    updatedAt: new Date('2026-10-01T09:00:00Z'),
    personCompanyAssociation: {
      id: 'pca-1',
      workspaceId: 'ws-123',
      role: 'Chief Financial Officer',
      person: {
        id: 'p-1',
        firstName: 'Jane',
        lastName: 'Doe',
        personKind: PersonKind.PERSON,
      },
      companyId: 'c-1',
      company: {
        id: 'c-1',
        name: 'Enterprise Inc',
        domain: 'enterprise.com',
      },
    },
    campaignRecipient: null,
  };

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outreach: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      careerProfile: {
        findUnique: jest.fn().mockResolvedValue({
          headline: 'VP Finance Partner',
          summary: 'Experienced with financial tools',
          targetRoles: ['Finance Lead'],
          skills: ['Budgeting'],
        }),
      },
      opportunity: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      evidence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    aiProvider = {
      complete: jest.fn(),
    };

    worker = new OutreachGenerationWorker(prisma, aiProvider);
  });

  it('reads persisted Outreach.aiPromptContext, generates grounded draft and updates outreach when draftVersion matches (sets SUCCEEDED)', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'CFO ROI Evaluation',
        body: 'Jane, how Enterprise Inc can achieve ROI in 30 days without risk.',
      }),
    });
    prisma.job.updateMany.mockResolvedValue({ count: 1 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);

    expect(aiProvider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining('Focus on CFO value and 30-day ROI'),
      }),
    );
    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        subject: 'CFO ROI Evaluation',
        message: 'Jane, how Enterprise Inc can achieve ROI in 30 days without risk.',
        outreachReason: expect.any(String),
        aiGenerationStatus: 'SUCCEEDED',
      },
    });
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseVersion: 1, status: 'RUNNING' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('skips AI overwrite when draftVersion has diverged (sets SKIPPED)', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    // User edited the draft while AI was generating -> draftVersion is now 1
    prisma.outreach.findUnique.mockResolvedValue({
      ...mockOutreach,
      draftVersion: 1,
      subject: 'Manually edited subject',
      message: 'Manually edited message body',
    });
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'AI Generated Subject',
        body: 'AI Generated Body for Enterprise Inc',
      }),
    });
    prisma.job.updateMany.mockResolvedValue({ count: 1 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);

    // AI must NOT overwrite manual edits; marks SKIPPED
    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        aiGenerationStatus: 'SKIPPED',
        outreachReason: expect.any(String),
      },
    });
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseVersion: 1, status: 'RUNNING' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          lastError: 'SKIPPED_DRAFT_MODIFIED',
        }),
      }),
    );
  });

  it('marks Outreach aiGenerationStatus = FAILED when job reaches dead letter if lease is valid', async () => {
    prisma.job.findUnique.mockResolvedValue({
      ...mockJob,
      attemptCount: 3,
      maxAttempts: 3, // dead letter!
    });
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockRejectedValue(new Error('LLM service permanently unavailable'));
    prisma.job.updateMany.mockResolvedValue({ count: 1 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);

    expect(prisma.outreach.updateMany).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: { aiGenerationStatus: 'FAILED' },
    });
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseVersion: 1, status: 'RUNNING' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('fails job update if concurrent worker incremented leaseVersion during success commit', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'Subject Line',
        body: 'A valid email body with sufficient characters to pass validation.',
      }),
    });
    // Atomic updateMany inside transaction returns count 0 because leaseVersion changed from 1 to 2
    prisma.job.updateMany.mockResolvedValue({ count: 0 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);
    // Outreach must NOT have been updated with success or skipped
    expect(prisma.outreach.update).not.toHaveBeenCalled();
  });

  it('does NOT mark Outreach aiGenerationStatus = FAILED if dead-letter occurs under stale lease', async () => {
    prisma.job.findUnique.mockResolvedValue({
      ...mockJob,
      attemptCount: 3,
      maxAttempts: 3,
    });
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockRejectedValue(new Error('Fatal error'));
    // Job update returns count: 0 because leaseVersion changed
    prisma.job.updateMany.mockResolvedValue({ count: 0 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);

    expect(prisma.outreach.updateMany).not.toHaveBeenCalled();
  });

  it('rejects AI output that fails strict domain validation without silent fallback', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    // Malformed output: non-JSON
    aiProvider.complete.mockResolvedValue({
      rawText: 'Sorry, I cannot fulfill this request.',
    });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);

    // Job should be marked for retry / failure, NOT committed with fallback text
    expect(prisma.outreach.update).not.toHaveBeenCalled();
  });
});
