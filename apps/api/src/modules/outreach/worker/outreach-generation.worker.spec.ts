import { OutreachGenerationWorker } from './outreach-generation.worker';

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
      role: 'Chief Financial Officer',
      person: {
        id: 'p-1',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      company: {
        id: 'c-1',
        name: 'Enterprise Inc',
      },
    },
  };

  beforeEach(() => {
    prisma = {
      job: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      outreach: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    aiProvider = {
      complete: jest.fn(),
    };

    worker = new OutreachGenerationWorker(prisma, aiProvider);
  });

  it('reads persisted Outreach.aiPromptContext and updates draft when draftVersion matches', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'CFO ROI Evaluation',
        body: 'Jane, how Enterprise Inc can achieve ROI in 30 days.',
      }),
    });
    prisma.job.updateMany.mockResolvedValue({ count: 1 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);

    expect(aiProvider.complete).toHaveBeenCalledWith(
      expect.stringContaining('Focus on CFO value and 30-day ROI'),
    );
    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        subject: 'CFO ROI Evaluation',
        message: 'Jane, how Enterprise Inc can achieve ROI in 30 days.',
      },
    });
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1', leaseVersion: 1, status: 'RUNNING' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('skips AI overwrite when draftVersion has diverged (optimistic edit protection)', async () => {
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
        body: 'AI Generated Body',
      }),
    });
    prisma.job.updateMany.mockResolvedValue({ count: 1 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);

    // AI must NOT overwrite manual edits
    expect(prisma.outreach.update).not.toHaveBeenCalled();
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

  it('fails job update if concurrent worker incremented leaseVersion', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.outreach.findUnique.mockResolvedValue(mockOutreach);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({ subject: 'Sub', body: 'Body' }),
    });
    // Lease update matches 0 rows because another worker bumped leaseVersion
    prisma.job.updateMany.mockResolvedValue({ count: 0 });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);
  });
});
