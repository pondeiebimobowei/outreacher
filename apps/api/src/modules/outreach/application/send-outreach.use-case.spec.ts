import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { SendEligibilityService } from '../../email/domain/send-eligibility.service';
import { SendOutreachUseCase } from './send-outreach.use-case';

describe('SendOutreachUseCase', () => {
  let useCase: SendOutreachUseCase;
  let eligibilityService: any;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      $queryRaw: jest.fn(),
      outreach: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      campaign: {
        findFirst: jest.fn(),
      },
      campaignRecipient: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      personCompanyAssociation: {
        findFirst: jest.fn(),
      },
      suppression: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      emailSend: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'send-1', ...data })),
      },
      senderAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      job: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data })),
      },
      idempotencyRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };

    eligibilityService = {
      reserveSenderCapacityAndCreateEmailSend: jest.fn(),
    };

    useCase = new SendOutreachUseCase(prisma, eligibilityService);
  });

  it('throws 400 Bad Request if idempotencyKey is missing', async () => {
    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        idempotencyKey: '',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 409 Conflict if idempotency key reused with different payload', async () => {
    prisma.idempotencyRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      workspaceId: 'ws-1',
      operation: 'POST:/outreaches/:id/send',
      key: 'idem-1',
      targetId: 'out-1',
      requestHash: 'hash-of-payload-a',
      jobId: 'job-1',
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        idempotencyKey: 'idem-1',
        payload: { different: true },
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 409 Conflict if Outreach is not in APPROVED status', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'DRAFT',
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 409 Conflict if Campaign initial send when PCA.conversationState is REPLIED', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'APPROVED',
      campaignRecipientId: 'recip-1',
      personCompanyAssociationId: 'pca-1',
    });
    prisma.campaignRecipient.findFirst.mockResolvedValue({
      id: 'recip-1',
      campaignId: 'camp-1',
      status: 'PENDING',
    });
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      status: 'ACTIVE',
    });
    prisma.personCompanyAssociation.findFirst.mockResolvedValue({
      id: 'pca-1',
      workspaceId: 'ws-1',
      conversationState: 'REPLIED',
      stateVersion: 1,
      person: { email: 'test@example.com' },
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('throws 409 Conflict if Campaign initial send when PCA.conversationState is ACTIVE', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'APPROVED',
      campaignRecipientId: 'recip-1',
      personCompanyAssociationId: 'pca-1',
    });
    prisma.campaignRecipient.findFirst.mockResolvedValue({
      id: 'recip-1',
      campaignId: 'camp-1',
      status: 'PENDING',
    });
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      status: 'ACTIVE',
    });
    prisma.personCompanyAssociation.findFirst.mockResolvedValue({
      id: 'pca-1',
      workspaceId: 'ws-1',
      conversationState: 'ACTIVE',
      stateVersion: 2,
      person: { email: 'test@example.com' },
    });

    await expect(
      useCase.execute({
        workspaceId: 'ws-1',
        outreachId: 'out-1',
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('allows One-Off initial send when PCA.conversationState is REPLIED', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      status: 'APPROVED',
      campaignRecipientId: null, // One-off
      personCompanyAssociationId: 'pca-1',
      subject: 'Re-engaging',
      message: 'Hello again',
      senderAccountId: 'sa-1',
    });
    prisma.personCompanyAssociation.findFirst.mockResolvedValue({
      id: 'pca-1',
      workspaceId: 'ws-1',
      conversationState: 'REPLIED',
      stateVersion: 3,
      person: { email: 'test@example.com' },
    });
    eligibilityService.reserveSenderCapacityAndCreateEmailSend.mockResolvedValue({
      id: 'send-1',
      status: 'RESERVED',
      senderAccountId: 'sa-1',
    });

    const res = await useCase.execute({
      workspaceId: 'ws-1',
      outreachId: 'out-1',
      idempotencyKey: 'idem-1',
    });

    expect(res.status).toBe('QUEUED');
    expect(prisma.outreach.update).toHaveBeenCalledWith({
      where: { id: 'out-1' },
      data: { status: 'SENDING' },
    });
    expect(eligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sequence: 0,
        type: 'INITIAL',
        expectedStateVersion: 3,
      }),
    );
  });
});
