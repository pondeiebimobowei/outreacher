import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { ApproveDraftUseCase } from './approve-draft.use-case';

describe('ApproveDraftUseCase', () => {
  let useCase: ApproveDraftUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      outreach: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      personCompanyAssociation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pca-1',
          conversationState: 'NO_REPLY',
          workEmail: 'alex@example.com',
          person: { email: 'alex@example.com' },
        }),
      },
      suppression: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    useCase = new ApproveDraftUseCase(prisma);
  });

  it('throws 404 if outreach not found in workspace', async () => {
    prisma.outreach.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws 409 Conflict if outreach is not in DRAFT status', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'APPROVED',
      updatedAt: new Date(),
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 409 Conflict if expectedUpdatedAt does not match', async () => {
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
        expectedUpdatedAt: new Date('2026-10-01T10:00:00Z'),
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 400 Bad Request if subject is empty', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      subject: '',
      message: 'Some body text',
      updatedAt: new Date(),
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request if message is empty', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      subject: 'Valid subject',
      message: '',
      updatedAt: new Date(),
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('successfully transitions Outreach status: DRAFT -> APPROVED', async () => {
    const updatedAt = new Date('2026-10-01T12:00:00Z');
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
      subject: 'Valid subject',
      message: 'Valid body text',
      updatedAt,
    });

    prisma.outreach.update.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      personCompanyAssociationId: 'pca-1',
      campaignRecipientId: null,
      senderAccountId: null,
      contentSource: 'MANUAL',
      templateId: null,
      aiPromptContext: null,
      draftVersion: 0,
      subject: 'Valid subject',
      message: 'Valid body text',
      outreachReason: null,
      status: 'APPROVED',
      maxFollowUps: 2,
      createdAt: updatedAt,
      updatedAt: new Date(),
    });

    const res = await useCase.execute({
      workspaceId: 'ws-1',
      outreachId: 'out-1',
      expectedUpdatedAt: updatedAt,
    });

    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: { status: 'APPROVED' },
    });
    expect(res.status).toBe('APPROVED');
  });
});
