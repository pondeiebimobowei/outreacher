import { AppNotFoundException } from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { GetCampaignContactsUseCase } from './get-campaign-contacts.use-case';

describe('GetCampaignContactsUseCase', () => {
  let useCase: GetCampaignContactsUseCase;
  let prisma: {
    campaign: { findFirst: jest.Mock };
    campaignContact: { findMany: jest.Mock };
  };

  const workspaceId = 'ws-123';
  const campaignId = 'camp-456';

  beforeEach(() => {
    prisma = {
      campaign: { findFirst: (jest.MockedFunction<any> = jest.fn()) },
      campaignContact: { findMany: (jest.MockedFunction<any> = jest.fn()) },
    };
    useCase = new GetCampaignContactsUseCase(
      prisma as unknown as PrismaService,
    );
  });

  it('throws AppNotFoundException when campaign does not exist in workspace', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(useCase.execute(workspaceId, campaignId)).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('returns all campaign contacts bound to the campaign with contact details', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: campaignId,
      workspaceId,
      name: 'Outreach — Acme',
    });

    const now = new Date();
    prisma.campaignContact.findMany.mockResolvedValue([
      {
        id: 'cc-1',
        workspaceId,
        campaignId,
        contactId: 'con-1',
        status: 'PENDING',
        targetRole: 'VP Engineering',
        outreachReason: 'Leads tech team',
        currentSubject: 'Subject 1',
        currentBody: 'Body 1 with enough characters here.',
        selectedOpportunityId: 'opp-1',
        createdAt: now,
        updatedAt: now,
        contact: {
          id: 'con-1',
          name: 'Sarah Connor',
          title: 'VP of Engineering',
          email: 'sarah@acme.com',
          contactKind: 'PERSON',
          confidence: 'HIGH',
        },
      },
    ]);

    const result = await useCase.execute(workspaceId, campaignId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cc-1');
    expect(result[0].contact.name).toBe('Sarah Connor');
    expect(result[0].status).toBe('PENDING');
  });
});
