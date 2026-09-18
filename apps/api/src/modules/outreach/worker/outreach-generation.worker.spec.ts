import { Test, TestingModule } from '@nestjs/testing';
import { OutreachGenerationWorker } from './outreach-generation.worker';
import { PrismaService } from '../../../database/prisma.service';

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
    createdAt: new Date('2026-09-18T10:00:00Z'),
    payload: {
      userId: 'usr-123',
      workspaceId: 'ws-123',
      campaignContactId: 'cc-123',
      contactId: 'cnt-1',
      companyId: 'cmp-1',
      draftVersion: 1,
    },
  };

  const mockCampaignContact = {
    id: 'cc-123',
    workspaceId: 'ws-123',
    contactId: 'cnt-1',
    updatedAt: new Date('2026-09-18T09:00:00Z'),
    contact: {
      id: 'cnt-1',
      name: 'Alice Smith',
      title: 'VP Eng',
      contactKind: 'PERSON',
    },
    campaign: {
      company: {
        id: 'cmp-1',
        name: 'Alpha Corp',
        domain: 'alpha.com',
        industry: 'Tech',
        description: 'AI platform',
      },
    },
    selectedOpportunity: {
      id: 'opp-1',
      opportunityType: 'PROACTIVE',
      roleTitle: 'Lead Engineer',
    },
  };

  beforeEach(async () => {
    prisma = {
      job: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      campaignContact: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      careerProfile: {
        findUnique: jest.fn(),
      },
      evidence: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    aiProvider = {
      complete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutreachGenerationWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: 'AIProvider', useValue: aiProvider },
      ],
    }).compile();

    worker = module.get<OutreachGenerationWorker>(OutreachGenerationWorker);
  });

  it('processes valid job and updates CampaignContact atomically', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.campaignContact.findUnique.mockResolvedValue(mockCampaignContact);
    prisma.careerProfile.findUnique.mockResolvedValue({
      headline: 'Senior Engineer',
      targetRoles: ['Lead Engineer'],
      skills: ['TypeScript'],
    });
    prisma.evidence.findMany.mockResolvedValue([]);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'Engineering alignment with Alpha Corp',
        body: 'Hello Alice, I have followed Alpha Corp work in AI platforms and wanted to connect regarding engineering background in TypeScript.',
      }),
    });

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);

    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'cc-123' },
      data: expect.objectContaining({
        currentSubject: 'Engineering alignment with Alpha Corp',
        currentBody: expect.stringContaining('Hello Alice'),
        outreachReason: expect.stringContaining(
          'Proactive outreach to Alice Smith',
        ),
      }),
    });

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
  });

  it('leaves CampaignContact completely untouched on AI validation failure', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.campaignContact.findUnique.mockResolvedValue(mockCampaignContact);
    prisma.careerProfile.findUnique.mockResolvedValue(null);
    prisma.evidence.findMany.mockResolvedValue([]);
    // AI output contains illegal opening claim for PROACTIVE opportunity
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'Applying for Lead Engineer opening',
        body: 'Hi Alice, I saw your job posting for Lead Engineer and want to apply.',
      }),
    });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);

    // Verify CampaignContact was NEVER updated
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();

    // Verify Job was marked PENDING for retry with error log
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'PENDING',
        lastError: expect.stringContaining('illegal opening claim'),
      }),
    });
  });

  it('detects worker stale attempt before execution and aborts without modifying CampaignContact', async () => {
    const staleCampaignContact = {
      ...mockCampaignContact,
      updatedAt: new Date('2026-09-18T11:00:00Z'), // Modified AFTER job creation at 10:00:00Z
    };

    prisma.job.findUnique.mockResolvedValue(mockJob);
    prisma.campaignContact.findUnique.mockResolvedValue(staleCampaignContact);

    const success = await worker.processJob('job-1');
    expect(success).toBe(true);
    expect(aiProvider.complete).not.toHaveBeenCalled();
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();
  });

  it('aborts persistence inside transaction when CampaignContact is updated concurrently during AI execution', async () => {
    prisma.job.findUnique.mockResolvedValue(mockJob);
    // Initial fetch returns non-stale contact
    prisma.campaignContact.findUnique.mockResolvedValueOnce(
      mockCampaignContact,
    );
    // Concurrent update occurs during AI execution -> transaction fetch returns stale contact
    const concurrentlyUpdatedContact = {
      ...mockCampaignContact,
      updatedAt: new Date('2026-09-18T12:00:00Z'),
    };
    prisma.campaignContact.findUnique.mockResolvedValueOnce(
      concurrentlyUpdatedContact,
    );

    prisma.careerProfile.findUnique.mockResolvedValue(null);
    prisma.evidence.findMany.mockResolvedValue([]);
    aiProvider.complete.mockResolvedValue({
      rawText: JSON.stringify({
        subject: 'Engineering alignment with Alpha Corp',
        body: 'Hello Alice, I have followed Alpha Corp work in AI platforms and wanted to connect.',
      }),
    });

    const success = await worker.processJob('job-1');
    expect(success).toBe(false);
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();
  });
});
