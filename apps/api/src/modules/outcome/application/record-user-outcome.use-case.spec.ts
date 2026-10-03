import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordUserOutcomeUseCase } from './record-user-outcome.use-case';
import { OutcomeType } from '@repo/db';

describe('RecordUserOutcomeUseCase', () => {
  let useCase: RecordUserOutcomeUseCase;
  let prismaMock: any;

  const outreachId = 'outreach-123';
  const pcaId = 'pca-456';
  const workspaceId = 'ws-123';
  const userId = 'u-123';

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => {
        return cb(prismaMock);
      }),
      $queryRaw: jest.fn(),
      outreach: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      outcome: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      personCompanyAssociation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      campaignRecipient: {
        findMany: jest.fn(),
      },
    };

    useCase = new RecordUserOutcomeUseCase(prismaMock);
  });

  it('records an outcome, transitions Outreach to COMPLETED, and releases PCA to NO_REPLY when no open outreaches remain', async () => {
    // Outreach exists and is open
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      personCompanyAssociationId: pcaId,
      status: 'ACTIVE',
    });

    // Lock queries succeed
    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);

    // No existing outcome on this outreach
    prismaMock.outcome.findUnique.mockResolvedValue(null);

    // Outcome created
    prismaMock.outcome.create.mockResolvedValue({ id: 'outcome-789' });

    // Outreach update to COMPLETED
    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'COMPLETED',
    });

    // PCA is currently ACTIVE
    prismaMock.personCompanyAssociation.findUnique.mockResolvedValue({
      id: pcaId,
      conversationState: 'ACTIVE',
      stateVersion: 3,
    });

    // Count open outreaches (DRAFT, APPROVED, SENDING, ACTIVE, PAUSED) excluding this outreach -> 0
    prismaMock.outreach.count.mockResolvedValue(0);

    const result = await useCase.execute(
      outreachId,
      workspaceId,
      userId,
      OutcomeType.QUALIFIED_CONVERSATION,
      'Great chat with the lead',
    );

    expect(result).toBe('outcome-789');

    // Verify outcome insertion
    expect(prismaMock.outcome.create).toHaveBeenCalledWith({
      data: {
        workspaceId,
        outreachId,
        recordedByUserId: userId,
        type: OutcomeType.QUALIFIED_CONVERSATION,
        notes: 'Great chat with the lead',
      },
    });

    // Verify Outreach status = COMPLETED
    expect(prismaMock.outreach.update).toHaveBeenCalledWith({
      where: { id: outreachId },
      data: { status: 'COMPLETED' },
    });

    // Verify PCA release: ACTIVE -> NO_REPLY (stateVersion incremented)
    expect(prismaMock.personCompanyAssociation.update).toHaveBeenCalledWith({
      where: { id: pcaId },
      data: {
        conversationState: 'NO_REPLY',
        stateVersion: { increment: 1 },
      },
    });
  });

  it('throws ConflictException if an Outcome has already been recorded for this outreach (strictly ONE outcome per thread)', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      personCompanyAssociationId: pcaId,
      status: 'ACTIVE',
    });
    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);

    // Outcome already exists for this outreach
    prismaMock.outcome.findUnique.mockResolvedValue({
      id: 'existing-outcome',
      outreachId,
    });

    await expect(
      useCase.execute(
        outreachId,
        workspaceId,
        userId,
        OutcomeType.NOT_INTERESTED,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.outcome.create).not.toHaveBeenCalled();
    expect(prismaMock.outreach.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if outreach does not exist in caller workspace', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute(
        outreachId,
        workspaceId,
        userId,
        OutcomeType.MEETING_BOOKED,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.outcome.create).not.toHaveBeenCalled();
  });

  it('preserves PCA REPLIED status when recording an Outcome (never erases a reply)', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      personCompanyAssociationId: pcaId,
      status: 'ACTIVE',
    });
    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.outcome.findUnique.mockResolvedValue(null);
    prismaMock.outcome.create.mockResolvedValue({ id: 'outcome-789' });
    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'COMPLETED',
    });

    // PCA is REPLIED
    prismaMock.personCompanyAssociation.findUnique.mockResolvedValue({
      id: pcaId,
      conversationState: 'REPLIED',
      stateVersion: 5,
    });
    prismaMock.outreach.count.mockResolvedValue(0);

    await useCase.execute(
      outreachId,
      workspaceId,
      userId,
      OutcomeType.MEETING_BOOKED,
    );

    // PCA state remains REPLIED; no update called
    expect(prismaMock.personCompanyAssociation.update).not.toHaveBeenCalled();
  });

  it('treats FAILED and COMPLETED outreaches as non-blocking terminal states when releasing PCA', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      personCompanyAssociationId: pcaId,
      status: 'ACTIVE',
    });
    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.outcome.findUnique.mockResolvedValue(null);
    prismaMock.outcome.create.mockResolvedValue({ id: 'outcome-789' });
    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'COMPLETED',
    });

    // PCA is ACTIVE
    prismaMock.personCompanyAssociation.findUnique.mockResolvedValue({
      id: pcaId,
      conversationState: 'ACTIVE',
      stateVersion: 2,
    });

    // Outreach 2 is FAILED, so open outreaches count is 0 (FAILED is terminal/non-blocking)
    prismaMock.outreach.count.mockResolvedValue(0);

    await useCase.execute(
      outreachId,
      workspaceId,
      userId,
      OutcomeType.UNSUBSCRIBED,
    );

    // Verified that PCA is released to NO_REPLY even though a FAILED outreach exists
    expect(prismaMock.personCompanyAssociation.update).toHaveBeenCalledWith({
      where: { id: pcaId },
      data: {
        conversationState: 'NO_REPLY',
        stateVersion: { increment: 1 },
      },
    });
  });

  it('does NOT release PCA if another open outreach exists on that PCA', async () => {
    prismaMock.outreach.findFirst.mockResolvedValue({
      id: outreachId,
      workspaceId,
      personCompanyAssociationId: pcaId,
      status: 'ACTIVE',
    });
    prismaMock.$queryRaw.mockResolvedValue([{ id: pcaId }]);
    prismaMock.outcome.findUnique.mockResolvedValue(null);
    prismaMock.outcome.create.mockResolvedValue({ id: 'outcome-789' });
    prismaMock.outreach.update.mockResolvedValue({
      id: outreachId,
      status: 'COMPLETED',
    });

    prismaMock.personCompanyAssociation.findUnique.mockResolvedValue({
      id: pcaId,
      conversationState: 'ACTIVE',
      stateVersion: 2,
    });

    // 1 open outreach still exists on this PCA (e.g. DRAFT or ACTIVE)
    prismaMock.outreach.count.mockResolvedValue(1);

    await useCase.execute(
      outreachId,
      workspaceId,
      userId,
      OutcomeType.QUALIFIED_CONVERSATION,
    );

    // PCA remains ACTIVE, no update called
    expect(prismaMock.personCompanyAssociation.update).not.toHaveBeenCalled();
  });
});
