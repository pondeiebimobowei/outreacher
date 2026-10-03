import { ConflictException, NotFoundException } from '@nestjs/common';
import { ResumeCampaignRecipientUseCase } from './resume-campaign-recipient.use-case';

describe('ResumeCampaignRecipientUseCase', () => {
  let useCase: ResumeCampaignRecipientUseCase;
  let prismaMock: any;

  const workspaceId = 'ws-1';
  const campaignId = 'camp-1';
  const recipientId = 'recip-1';
  const pcaId = 'pca-1';

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
      campaignRecipient: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      suppression: {
        findUnique: jest.fn(),
      },
      personCompanyAssociation: {
        findUnique: jest.fn(),
      },
    };

    useCase = new ResumeCampaignRecipientUseCase(prismaMock);
  });

  it('resumes SUPPRESSED recipient to PENDING when PCA conversationState is NO_REPLY and email is not suppressed', async () => {
    prismaMock.campaignRecipient.findFirst.mockResolvedValue({
      id: recipientId,
      workspaceId,
      campaignId,
      personCompanyAssociationId: pcaId,
      status: 'SUPPRESSED',
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'NO_REPLY',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    // Lock Campaign -> CampaignRecipient -> PCA
    prismaMock.$queryRaw.mockResolvedValue([{ id: campaignId }]);

    // No suppression in workspace
    prismaMock.suppression.findUnique.mockResolvedValue(null);

    prismaMock.campaignRecipient.update.mockResolvedValue({
      id: recipientId,
      status: 'PENDING',
    });

    const result = await useCase.execute(workspaceId, campaignId, recipientId);

    expect(result.status).toBe('PENDING');
    expect(prismaMock.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: recipientId },
      data: { status: 'PENDING' },
    });
  });

  it('throws ConflictException if PCA conversationState is not NO_REPLY (e.g. REPLIED or STOPPED)', async () => {
    prismaMock.campaignRecipient.findFirst.mockResolvedValue({
      id: recipientId,
      workspaceId,
      campaignId,
      personCompanyAssociationId: pcaId,
      status: 'SUPPRESSED',
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'STOPPED',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: campaignId }]);

    await expect(
      useCase.execute(workspaceId, campaignId, recipientId),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.campaignRecipient.update).not.toHaveBeenCalled();
  });

  it('throws ConflictException if email is still in Suppression table', async () => {
    prismaMock.campaignRecipient.findFirst.mockResolvedValue({
      id: recipientId,
      workspaceId,
      campaignId,
      personCompanyAssociationId: pcaId,
      status: 'SUPPRESSED',
      personCompanyAssociation: {
        id: pcaId,
        conversationState: 'NO_REPLY',
        workEmail: 'lead@example.com',
        person: { email: 'lead@example.com' },
      },
    });

    prismaMock.$queryRaw.mockResolvedValue([{ id: campaignId }]);
    prismaMock.suppression.findUnique.mockResolvedValue({ id: 'sup-1', email: 'lead@example.com' });

    await expect(
      useCase.execute(workspaceId, campaignId, recipientId),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.campaignRecipient.update).not.toHaveBeenCalled();
  });
});
