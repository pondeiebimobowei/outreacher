import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { GetCampaignContactUseCase } from './get-campaign-contact.use-case';

describe('GetCampaignContactUseCase', () => {
  let useCase: GetCampaignContactUseCase;
  let prisma: {
    campaignMember: { findUnique: jest.Mock };
    evidence: { findMany: jest.Mock };
    job: { findFirst: jest.Mock };
    emailSend: { findFirst: jest.Mock };
  };

  const workspaceId = 'ws-123';
  const campaignMemberId = 'cc-456';

  beforeEach(() => {
    prisma = {
      campaignMember: { findUnique: jest.fn() },
      evidence: { findMany: jest.fn() },
      job: { findFirst: jest.fn() },
      emailSend: { findFirst: jest.fn() },
    };
    useCase = new GetCampaignContactUseCase(prisma as unknown as PrismaService);
  });

  it('throws AppNotFoundException when campaign contact does not exist', async () => {
    prisma.campaignMember.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute({ workspaceId, campaignMemberId }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws AppNotFoundException when campaign contact belongs to another workspace', async () => {
    prisma.campaignMember.findUnique.mockResolvedValue({
      id: campaignMemberId,
      workspaceId: 'other-ws',
    });

    await expect(
      useCase.execute({ workspaceId, campaignMemberId }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('returns full campaign contact details including contact, campaign, evidence, and generation job', async () => {
    const updatedAt = new Date();
    prisma.campaignMember.findUnique.mockResolvedValue({
      id: campaignMemberId,
      workspaceId,
      campaignId: 'camp-1',
      personId: 'con-1',
      status: 'PENDING',
      targetRole: 'Staff Engineer',
      outreachReason: 'Leading platform engineering hire',
      currentSubject: 'Acme Architecture Discussion',
      currentBody:
        'Hi Sarah, I saw Acme is scaling its distributed systems team...',
      selectedOpportunityId: 'opp-1',
      createdAt: new Date(),
      updatedAt,
      person: {
        id: 'con-1',
        name: 'Sarah Connor',
        title: 'VP of Engineering',
        email: 'sarah@acme.com',
        personKind: 'PERSON',
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

    const sentAt = new Date();
    prisma.emailSend.findFirst.mockResolvedValue({
      id: 'send-202',
      status: 'SENT',
      sentAt,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
    });

    const result = await useCase.execute({ workspaceId, campaignMemberId });

    expect(result.id).toBe(campaignMemberId);
    expect(result.status).toBe('PENDING');
    expect(result.name).toBe('Sarah Connor');
    expect(result.person.emailConfidence).toBe('AVAILABLE');
    expect(result.campaign.name).toBe('Outreach — Acme');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].classification).toBe('FACT');
    expect(result.generationJob?.id).toBe('job-101');
    expect(result.generationJob?.status).toBe('COMPLETED');
    expect(result.latestEmailSend?.id).toBe('send-202');
    expect(result.latestEmailSend?.status).toBe('SENT');
    expect(result.latestEmailSend?.sentAt).toEqual(sentAt);
  });
});
