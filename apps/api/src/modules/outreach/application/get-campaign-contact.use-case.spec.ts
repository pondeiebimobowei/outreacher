import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { GetCampaignContactUseCase } from './get-campaign-contact.use-case';

describe('GetCampaignContactUseCase', () => {
  let useCase: GetCampaignContactUseCase;
  let prisma: {
    campaignContact: { findUnique: jest.Mock };
    evidence: { findMany: jest.Mock };
    job: { findFirst: jest.Mock };
  };

  const workspaceId = 'ws-123';
  const campaignContactId = 'cc-456';

  beforeEach(() => {
    prisma = {
      campaignContact: { findUnique: jest.fn() },
      evidence: { findMany: jest.fn() },
      job: { findFirst: jest.fn() },
    };
    useCase = new GetCampaignContactUseCase(prisma as unknown as PrismaService);
  });

  it('throws AppNotFoundException when campaign contact does not exist', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute({ workspaceId, campaignContactId }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws AppNotFoundException when campaign contact belongs to another workspace', async () => {
    prisma.campaignContact.findUnique.mockResolvedValue({
      id: campaignContactId,
      workspaceId: 'other-ws',
    });

    await expect(
      useCase.execute({ workspaceId, campaignContactId }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('returns full campaign contact details including contact, campaign, evidence, and generation job', async () => {
    const updatedAt = new Date();
    prisma.campaignContact.findUnique.mockResolvedValue({
      id: campaignContactId,
      workspaceId,
      campaignId: 'camp-1',
      contactId: 'con-1',
      status: 'PENDING',
      targetRole: 'Staff Engineer',
      outreachReason: 'Leading platform engineering hire',
      currentSubject: 'Acme Architecture Discussion',
      currentBody:
        'Hi Sarah, I saw Acme is scaling its distributed systems team...',
      selectedOpportunityId: 'opp-1',
      createdAt: new Date(),
      updatedAt,
      contact: {
        id: 'con-1',
        name: 'Sarah Connor',
        title: 'VP of Engineering',
        email: 'sarah@acme.com',
        contactKind: 'PERSON',
        confidence: 'HIGH',
      },
      campaign: {
        id: 'camp-1',
        name: 'Outreach — Acme',
        status: 'DRAFT',
        companyId: 'comp-1',
      },
      selectedOpportunity: {
        id: 'opp-1',
        roleTitle: 'Lead Distributed Systems Architect',
        opportunityType: 'CONFIRMED',
      },
    });

    prisma.evidence.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        claim: 'Verified opening for Lead Architect',
        classification: 'FACT',
        sourceName: 'Careers Page',
        sourceUrl: 'https://acme.com/jobs/1',
        sourceExcerpt: 'Looking for a Lead Architect',
        confidence: 0.95,
      },
    ]);

    prisma.job.findFirst.mockResolvedValue({
      id: 'job-101',
      status: 'COMPLETED',
      createdAt: new Date(),
      completedAt: new Date(),
      lastError: null,
    });

    const result = await useCase.execute({ workspaceId, campaignContactId });

    expect(result.id).toBe(campaignContactId);
    expect(result.status).toBe('PENDING');
    expect(result.contact.name).toBe('Sarah Connor');
    expect(result.contact.emailConfidence).toBe('AVAILABLE');
    expect(result.campaign.name).toBe('Outreach — Acme');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].classification).toBe('FACT');
    expect(result.generationJob?.id).toBe('job-101');
    expect(result.generationJob?.status).toBe('COMPLETED');
  });
});
