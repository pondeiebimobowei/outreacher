import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { ISuppressionChecker } from './suppression-checker.interface';
import { SendEligibilityService } from './send-eligibility.service';
import { EmailSendStatus } from '@repo/db';

describe('SendEligibilityService', () => {
  let service: SendEligibilityService;
  let mockSuppressionChecker: jest.Mocked<ISuppressionChecker>;
  let mockProviderRegistry: any;

  const validWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const validOutreachId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    mockSuppressionChecker = {
      isSuppressed: jest.fn().mockResolvedValue(false),
    };
    mockProviderRegistry = {
      hasAdapter: jest.fn().mockReturnValue(true),
    };
    service = new SendEligibilityService(
      mockSuppressionChecker,
      mockProviderRegistry,
    );
  });

  describe('checkOutreachEligibility', () => {
    it('throws AppNotFoundException if outreach is missing or workspaceId mismatches', async () => {
      await expect(
        service.checkOutreachEligibility(validWorkspaceId, null, 'user@example.com'),
      ).rejects.toThrow(AppNotFoundException);

      await expect(
        service.checkOutreachEligibility(
          validWorkspaceId,
          { id: validOutreachId, workspaceId: 'wrong-ws', status: 'APPROVED' },
          'user@example.com',
        ),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('throws AppConflictException if outreach is not in APPROVED status', async () => {
      await expect(
        service.checkOutreachEligibility(
          validWorkspaceId,
          { id: validOutreachId, workspaceId: validWorkspaceId, status: 'DRAFT' },
          'user@example.com',
        ),
      ).rejects.toThrow(AppConflictException);
    });

    it('throws AppValidationException if recipient email is empty or missing', async () => {
      await expect(
        service.checkOutreachEligibility(
          validWorkspaceId,
          { id: validOutreachId, workspaceId: validWorkspaceId, status: 'APPROVED' },
          '',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws AppConflictException if recipient email is suppressed', async () => {
      mockSuppressionChecker.isSuppressed.mockResolvedValue(true);

      await expect(
        service.checkOutreachEligibility(
          validWorkspaceId,
          { id: validOutreachId, workspaceId: validWorkspaceId, status: 'APPROVED' },
          'suppressed@example.com',
        ),
      ).rejects.toThrow(AppConflictException);
    });

    it('succeeds when outreach is APPROVED and recipient is not suppressed', async () => {
      mockSuppressionChecker.isSuppressed.mockResolvedValue(false);

      await expect(
        service.checkOutreachEligibility(
          validWorkspaceId,
          { id: validOutreachId, workspaceId: validWorkspaceId, status: 'APPROVED' },
          'valid@example.com',
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('reserveSenderCapacityAndCreateEmailSend', () => {
    it('throws if called outside an active transaction', async () => {
      const nonTxClient: any = { $connect: jest.fn() };

      await expect(
        service.reserveSenderCapacityAndCreateEmailSend(nonTxClient, {
          workspaceId: validWorkspaceId,
          outreachId: validOutreachId,
          sequence: 0,
          type: 'INITIAL',
          expectedStateVersion: 0,
          subject: 'Test Subject',
          body: 'Test Body',
        }),
      ).rejects.toThrow('Capacity invariant violation');
    });

    it('throws NEEDS_SENDER if no candidate senders are found', async () => {
      const mockTx: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      await expect(
        service.reserveSenderCapacityAndCreateEmailSend(mockTx, {
          workspaceId: validWorkspaceId,
          outreachId: validOutreachId,
          sequence: 0,
          type: 'INITIAL',
          expectedStateVersion: 0,
          subject: 'Test Subject',
          body: 'Test Body',
        }),
      ).rejects.toThrow(new AppConflictException('NEEDS_SENDER'));
    });

    it('selects sender with min(consumedCount) and creates EmailSend as RESERVED', async () => {
      const candidates = [
        { id: 'sa-1', daily_limit: 50, provider: 'RESEND' },
        { id: 'sa-2', daily_limit: 50, provider: 'RESEND' },
      ];

      const mockTx: any = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce(candidates) // candidates query
          .mockResolvedValueOnce([{ count: 20n }]) // consumed for sa-1
          .mockResolvedValueOnce([{ count: 5n }]), // consumed for sa-2 (lower)
        emailSend: {
          create: jest.fn().mockImplementation(({ data }) => ({ id: 'send-1', ...data })),
        },
      };

      const result = await service.reserveSenderCapacityAndCreateEmailSend(mockTx, {
        workspaceId: validWorkspaceId,
        outreachId: validOutreachId,
        sequence: 0,
        type: 'INITIAL',
        expectedStateVersion: 1,
        subject: 'Hello',
        body: 'World',
      });

      expect(result.senderAccountId).toBe('sa-2');
      expect(result.status).toBe(EmailSendStatus.RESERVED);
      expect(result.sequence).toBe(0);
      expect(result.expectedStateVersion).toBe(1);
      expect(mockTx.emailSend.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderAccountId: 'sa-2',
            status: EmailSendStatus.RESERVED,
            sequence: 0,
            expectedStateVersion: 1,
          }),
        }),
      );
    });

    it('throws SENDER_CAPACITY_EXCEEDED when all candidates have reached their dailyLimit', async () => {
      const candidates = [{ id: 'sa-1', daily_limit: 10, provider: 'RESEND' }];

      const mockTx: any = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce(candidates)
          .mockResolvedValueOnce([{ count: 10n }]), // equal to dailyLimit
      };

      await expect(
        service.reserveSenderCapacityAndCreateEmailSend(mockTx, {
          workspaceId: validWorkspaceId,
          outreachId: validOutreachId,
          sequence: 0,
          type: 'INITIAL',
          expectedStateVersion: 0,
          subject: 'Test',
          body: 'Test',
        }),
      ).rejects.toThrow(new AppConflictException('SENDER_CAPACITY_EXCEEDED'));
    });
  });

  describe('reservePendingEmailSendForRetry (Test 11)', () => {
    it('throws AppConflictException if EmailSend is not PENDING', async () => {
      const mockTx: any = {
        emailSend: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'send-1',
            status: EmailSendStatus.SENDING,
            senderAccountId: 'sa-1',
          }),
        },
      };

      await expect(
        service.reservePendingEmailSendForRetry(mockTx, validWorkspaceId, 'send-1', 2),
      ).rejects.toThrow(new AppConflictException('EmailSend is not in PENDING status'));
    });

    it('preserves existing senderAccountId, re-validates capacity, and transitions PENDING -> RESERVED', async () => {
      const emailSend = {
        id: 'send-1',
        workspaceId: validWorkspaceId,
        status: EmailSendStatus.PENDING,
        senderAccountId: 'sa-specific',
      };

      const candidate = [{ id: 'sa-specific', daily_limit: 50, provider: 'RESEND' }];

      const mockTx: any = {
        emailSend: {
          findFirst: jest.fn().mockResolvedValue(emailSend),
          update: jest.fn().mockImplementation(({ data }) => ({ ...emailSend, ...data })),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce(candidate) // sender locked with FOR UPDATE
          .mockResolvedValueOnce([{ count: 10n }]), // consumed capacity
      };

      const result = await service.reservePendingEmailSendForRetry(
        mockTx,
        validWorkspaceId,
        'send-1',
        3,
      );

      expect(result.status).toBe(EmailSendStatus.RESERVED);
      expect(result.expectedStateVersion).toBe(3);
      expect(mockTx.emailSend.update).toHaveBeenCalledWith({
        where: { id: 'send-1' },
        data: {
          status: EmailSendStatus.RESERVED,
          reservedAt: expect.any(Date),
          expectedStateVersion: 3,
        },
      });
    });

    it('throws SENDER_UNAVAILABLE if preserved sender is inactive or missing', async () => {
      const emailSend = {
        id: 'send-1',
        workspaceId: validWorkspaceId,
        status: EmailSendStatus.PENDING,
        senderAccountId: 'sa-inactive',
      };

      const mockTx: any = {
        emailSend: {
          findFirst: jest.fn().mockResolvedValue(emailSend),
        },
        $queryRaw: jest.fn().mockResolvedValueOnce([]), // inactive or not found
      };

      await expect(
        service.reservePendingEmailSendForRetry(mockTx, validWorkspaceId, 'send-1', 1),
      ).rejects.toThrow(new AppConflictException('SENDER_UNAVAILABLE'));
    });
  });
});
