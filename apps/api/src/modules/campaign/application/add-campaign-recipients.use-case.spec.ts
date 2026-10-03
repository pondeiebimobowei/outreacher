import { AppForbiddenException, AppNotFoundException } from '../../../common/errors/application.exception';
import { AddCampaignRecipientsUseCase } from './add-campaign-recipients.use-case';

describe('AddCampaignRecipientsUseCase', () => {
  let useCase: AddCampaignRecipientsUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      campaign: {
        findFirst: jest.fn(),
      },
      personCompanyAssociation: {
        findMany: jest.fn(),
      },
      campaignRecipient: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    useCase = new AddCampaignRecipientsUseCase(prisma);
  });

  it('throws 404 if campaign is not found in workspace', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        recipients: [{ personCompanyAssociationId: 'pca-1' }],
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws 403 if any personCompanyAssociation belongs to another workspace', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
    });
    prisma.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-1', workspaceId: 'ws-other' },
    ]);

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        recipients: [{ personCompanyAssociationId: 'pca-1' }],
      }),
    ).rejects.toThrow(AppForbiddenException);
  });

  it('enrolls recipients from multiple companies into the same campaign', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Multi-company campaign',
    });

    // PCA 1 is Company A, PCA 2 is Company B, both in ws-1
    prisma.personCompanyAssociation.findMany.mockResolvedValue([
      { id: 'pca-1', workspaceId: 'ws-1', companyId: 'comp-a' },
      { id: 'pca-2', workspaceId: 'ws-1', companyId: 'comp-b' },
    ]);

    prisma.campaignRecipient.findMany.mockResolvedValue([
      {
        id: 'recip-1',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        personCompanyAssociationId: 'pca-1',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'recip-2',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        personCompanyAssociationId: 'pca-2',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await useCase.execute('ws-1', 'camp-1', {
      recipients: [
        { personCompanyAssociationId: 'pca-1' },
        { personCompanyAssociationId: 'pca-2' },
      ],
    });

    expect(res).toHaveLength(2);
    expect(prisma.campaignRecipient.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          campaignId: 'camp-1',
          personCompanyAssociationId: 'pca-1',
          status: 'PENDING',
        }),
        expect.objectContaining({
          campaignId: 'camp-1',
          personCompanyAssociationId: 'pca-2',
          status: 'PENDING',
        }),
      ]),
    });
  });
});
