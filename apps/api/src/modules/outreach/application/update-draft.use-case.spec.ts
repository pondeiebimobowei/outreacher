import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { UpdateDraftUseCase } from './update-draft.use-case';

describe('UpdateDraftUseCase', () => {
  let useCase: UpdateDraftUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      outreach: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    useCase = new UpdateDraftUseCase(prisma);
  });

  it('throws 400 Bad Request if both subject and message are undefined', async () => {
    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 404 if outreach not found in workspace', async () => {
    prisma.outreach.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        subject: 'New subject',
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws 409 Conflict if outreach is not in DRAFT status', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'ACTIVE',
      updatedAt: new Date(),
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        subject: 'New subject',
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 409 Conflict if expectedUpdatedAt does not match current updatedAt', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      updatedAt: new Date('2026-10-01T12:00:00Z'),
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        subject: 'New subject',
        expectedUpdatedAt: new Date('2026-10-01T10:00:00Z'),
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('successfully updates draft and increments draftVersion', async () => {
    const updatedAt = new Date('2026-10-01T12:00:00Z');
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      draftVersion: 0,
      updatedAt,
    });

    prisma.outreach.update.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      personCompanyAssociationId: 'pca-1',
      campaignRecipientId: null,
      senderAccountId: null,
      contentSource: 'AI',
      templateId: null,
      aiPromptContext: null,
      draftVersion: 1,
      subject: 'Refined Subject',
      message: 'Refined message body',
      outreachReason: null,
      status: 'DRAFT',
      maxFollowUps: 2,
      createdAt: updatedAt,
      updatedAt: new Date(),
    });

    const res = await useCase.execute({
      workspaceId: 'ws-1',
      outreachId: 'out-1',
      subject: 'Refined Subject',
      message: 'Refined message body',
      expectedUpdatedAt: updatedAt,
    });

    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        subject: 'Refined Subject',
        message: 'Refined message body',
        draftVersion: { increment: 1 },
      },
    });
    expect(res.draftVersion).toBe(1);
    expect(res.subject).toBe('Refined Subject');
  });

  it('sets aiGenerationStatus = SKIPPED when editing an in-flight PENDING AI draft', async () => {
    const updatedAt = new Date('2026-10-01T12:00:00Z');
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      contentSource: 'AI',
      aiGenerationStatus: 'PENDING',
      draftVersion: 0,
      updatedAt,
    });

    prisma.outreach.update.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      contentSource: 'AI',
      aiGenerationStatus: 'SKIPPED',
      draftVersion: 1,
      subject: 'Manual Subject Override',
      message: 'Manual Body Override',
      status: 'DRAFT',
      updatedAt: new Date(),
    });

    const res = await useCase.execute({
      workspaceId: 'ws-1',
      outreachId: 'out-1',
      subject: 'Manual Subject Override',
      message: 'Manual Body Override',
      expectedUpdatedAt: updatedAt,
    });

    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: {
        subject: 'Manual Subject Override',
        message: 'Manual Body Override',
        aiGenerationStatus: 'SKIPPED',
        draftVersion: { increment: 1 },
      },
    });
    expect(res.aiGenerationStatus).toBe('SKIPPED');
  });
});
