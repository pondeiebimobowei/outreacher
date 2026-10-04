import {
  MarkContactRepliedUseCase,
  ContactStateTransitionException,
} from './mark-contact-replied.use-case';

describe('MarkContactRepliedUseCase', () => {
  let useCase: MarkContactRepliedUseCase;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      personCompanyAssociation: {
        update: jest.fn().mockResolvedValue({ id: 'pca-1', conversationState: 'REPLIED' }),
      },
      emailSend: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignRecipient: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    useCase = new MarkContactRepliedUseCase(prismaMock);
  });

  it('should successfully transition PCA to REPLIED, cancel jobs, and complete campaign recipients', async () => {
    // 1. Discover campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([{ campaign_id: 'camp-1' }]);
    // 2. Lock campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    // 3. Lock campaign recipients
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'rec-1', status: 'ACTIVE' }]);
    // 4. Lock PCA
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 'pca-1', conversation_state: 'ACTIVE', state_version: 1 },
    ]);
    // 5. Lock Outreaches
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'out-1', status: 'ACTIVE' }]);
    // 6. Lock EmailSends
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'send-1', status: 'RESERVED' }]);

    await useCase.execute('pca-1', 'ws-1');

    expect(prismaMock.personCompanyAssociation.update).toHaveBeenCalledWith({
      where: { id: 'pca-1' },
      data: {
        conversationState: 'REPLIED',
        stateVersion: { increment: 1 },
      },
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalled(); // Job cancellation
    expect(prismaMock.emailSend.updateMany).toHaveBeenCalledWith({
      where: {
        outreachId: { in: ['out-1'] },
        status: 'RESERVED',
      },
      data: {
        status: 'CANCELLED',
      },
    });
    expect(prismaMock.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        personCompanyAssociationId: 'pca-1',
        workspaceId: 'ws-1',
        status: { in: ['PENDING', 'ACTIVE'] },
      },
      data: {
        status: 'COMPLETED',
      },
    });
  });

  it('should throw terminal exception if PCA not found or tenant mismatch', async () => {
    // 1. Discover campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    // 2. Lock campaign recipients
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    // 3. Lock PCA (returns empty array)
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(useCase.execute('pca-missing', 'ws-1')).rejects.toThrow(
      ContactStateTransitionException,
    );

    expect(prismaMock.personCompanyAssociation.update).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('should cancel jobs across multiple outreaches for the same PCA with tenant and status predicates', async () => {
    // 1. Discover campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([{ campaign_id: 'camp-1' }, { campaign_id: 'camp-2' }]);
    // 2. Lock campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    // 3. Lock campaign recipients
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'rec-1' }, { id: 'rec-2' }]);
    // 4. Lock PCA
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'pca-1', conversation_state: 'ACTIVE', state_version: 1 }]);
    // 5. Lock Outreaches (2 outreaches)
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'out-1', status: 'ACTIVE' }, { id: 'out-2', status: 'ACTIVE' }]);
    // 6. Lock EmailSends
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'send-1' }, { id: 'send-2' }]);

    await useCase.execute('pca-1', 'ws-1');

    // Job cancellation called for both out-1 and out-2
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prismaMock.emailSend.updateMany).toHaveBeenCalledWith({
      where: {
        outreachId: { in: ['out-1', 'out-2'] },
        status: 'RESERVED',
      },
      data: {
        status: 'CANCELLED',
      },
    });
  });

  it('should roll back atomically if transaction fails midway', async () => {
    // 1. Discover campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([{ campaign_id: 'camp-1' }]);
    // 2. Lock campaigns
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    // 3. Lock campaign recipients
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'rec-1' }]);
    // 4. Lock PCA
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'pca-1', conversation_state: 'ACTIVE', state_version: 1 }]);
    // 5. Lock Outreaches
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'out-1' }]);
    // 6. Lock EmailSends
    prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'send-1' }]);

    // PCA update fails with DB connection error
    prismaMock.personCompanyAssociation.update.mockRejectedValueOnce(
      new Error('Database transaction abort'),
    );

    await expect(useCase.execute('pca-1', 'ws-1')).rejects.toThrow('Database transaction abort');
    // Downstream mutations not reached due to rollback
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.campaignRecipient.updateMany).not.toHaveBeenCalled();
  });
});
