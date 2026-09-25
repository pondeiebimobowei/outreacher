import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordUserOutcomeUseCase } from './record-user-outcome.use-case';
import { OutcomeType } from '@repo/db';

describe('RecordUserOutcomeUseCase', () => {
  let useCase: RecordUserOutcomeUseCase;
  let prismaMock: any;

  const campaignMemberId = 'cc-123';
  const workspaceId = 'ws-123';
  const userId = 'u-123';

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => {
        return cb(prismaMock);
      }),
      $queryRaw: jest.fn(),
      outcome: {
        create: jest.fn(),
      },
      campaignMember: {
        update: jest.fn(),
      },
    };

    useCase = new RecordUserOutcomeUseCase(prismaMock);
  });

  it('creates an Outcome and updates contact to COMPLETED if status is REPLIED', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: campaignMemberId, workspace_id: workspaceId, status: 'REPLIED' },
    ]);
    prismaMock.outcome.create.mockResolvedValue({ id: 'out-123' });
    prismaMock.campaignMember.update.mockResolvedValue({
      id: campaignMemberId,
      status: 'COMPLETED',
    });

    const result = await useCase.execute(
      campaignMemberId,
      workspaceId,
      userId,
      OutcomeType.QUALIFIED_CONVERSATION,
      'Great chat',
    );

    expect(result).toBe('out-123');
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.outcome.create).toHaveBeenCalledWith({
      data: {
        workspaceId,
        campaignMemberId,
        recordedByUserId: userId,
        type: OutcomeType.QUALIFIED_CONVERSATION,
        notes: 'Great chat',
      },
    });
    expect(prismaMock.campaignMember.update).toHaveBeenCalledWith({
      where: { id: campaignMemberId },
      data: { status: 'COMPLETED' },
    });
  });

  it('throws NotFoundException if contact does not exist in caller workspace', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]); // No matching contact

    await expect(
      useCase.execute(
        campaignMemberId,
        workspaceId,
        userId,
        OutcomeType.QUALIFIED_CONVERSATION,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.outcome.create).not.toHaveBeenCalled();
    expect(prismaMock.campaignMember.update).not.toHaveBeenCalled();
  });

  it('throws ConflictException if contact is already COMPLETED', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: campaignMemberId, workspace_id: workspaceId, status: 'COMPLETED' },
    ]);

    await expect(
      useCase.execute(
        campaignMemberId,
        workspaceId,
        userId,
        OutcomeType.QUALIFIED_CONVERSATION,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.outcome.create).not.toHaveBeenCalled();
    expect(prismaMock.campaignMember.update).not.toHaveBeenCalled();
  });

  it('throws ConflictException if contact is in another state like PENDING', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: campaignMemberId, workspace_id: workspaceId, status: 'PENDING' },
    ]);

    await expect(
      useCase.execute(
        campaignMemberId,
        workspaceId,
        userId,
        OutcomeType.QUALIFIED_CONVERSATION,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prismaMock.outcome.create).not.toHaveBeenCalled();
    expect(prismaMock.campaignMember.update).not.toHaveBeenCalled();
  });

  it('sets notes to null if not provided', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { id: campaignMemberId, workspace_id: workspaceId, status: 'REPLIED' },
    ]);
    prismaMock.outcome.create.mockResolvedValue({ id: 'out-123' });
    prismaMock.campaignMember.update.mockResolvedValue({
      id: campaignMemberId,
      status: 'COMPLETED',
    });

    await useCase.execute(
      campaignMemberId,
      workspaceId,
      userId,
      OutcomeType.NOT_INTERESTED,
    );

    expect(prismaMock.outcome.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: null }),
    });
  });
});
