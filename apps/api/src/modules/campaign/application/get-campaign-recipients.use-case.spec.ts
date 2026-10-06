import { AppNotFoundException } from '../../../common/errors/application.exception';
import { GetCampaignRecipientsUseCase } from './get-campaign-recipients.use-case';

describe('GetCampaignRecipientsUseCase', () => {
  let useCase: GetCampaignRecipientsUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      campaign: {
        findFirst: jest.fn(),
      },
      campaignRecipient: {
        findMany: jest.fn(),
      },
      emailTemplateStep: {
        findFirst: jest.fn(),
      },
      outreach: {
        create: jest.fn(),
      },
    };
    useCase = new GetCampaignRecipientsUseCase(prisma);
  });

  it('throws AppNotFoundException if campaign is not found', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('ws-1', 'camp-missing'),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('returns enrolled recipients and initializes missing 1:1 outreaches', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      maxFollowUps: 2,
      campaignSenderAccounts: [{ senderAccountId: 'sa-1', status: 'ACTIVE' }],
    });

    prisma.emailTemplateStep.findFirst.mockResolvedValue({
      templateId: 'tmpl-1',
      sequence: 0,
      subjectTemplate: 'Hello {{contact.firstName}}',
      bodyTemplate: 'Hi {{contact.firstName}}, greetings from {{company.name}}',
    });

    prisma.outreach.create.mockResolvedValue({
      id: 'out-new-1',
      status: 'DRAFT',
      subject: 'Hello Alice',
      message: 'Hi Alice, greetings from Acme Corp',
      aiGenerationStatus: null,
    });

    prisma.campaignRecipient.findMany.mockResolvedValue([
      {
        id: 'recip-1',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        personCompanyAssociationId: 'pca-1',
        status: 'PENDING',
        targetRole: 'CTO',
        selectedOpportunityId: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        outreach: null,
        personCompanyAssociation: {
          person: {
            id: 'p-1',
            firstName: 'Alice',
            lastName: 'Smith',
            title: 'CTO',
            email: 'alice@acme.com',
            personKind: 'PERSON',
            confidence: 'HIGH',
          },
          company: {
            id: 'c-1',
            name: 'Acme Corp',
          },
        },
      },
    ]);

    const result = await useCase.execute('ws-1', 'camp-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('recip-1');
    expect(result[0].person.firstName).toBe('Alice');
    expect(result[0].outreachId).toBe('out-new-1');
    expect(prisma.outreach.create).toHaveBeenCalled();
  });
});
