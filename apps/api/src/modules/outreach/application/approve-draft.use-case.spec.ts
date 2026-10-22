import { Test, TestingModule } from '@nestjs/testing';
import { ApproveDraftUseCase } from './approve-draft.use-case';
import { PrismaService } from '../../../database/prisma.service';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';

describe('ApproveDraftUseCase', () => {
  let useCase: ApproveDraftUseCase;
  let prisma: any;

  const mockDate = new Date();

  const mockContact = {
    id: 'cnt-123',
    workspaceId: 'ws-123',
    email: 'test@example.com',
  };

  const mockCampaignContact = {
    id: 'cc-123',
    workspaceId: 'ws-123',
    campaignId: 'cmp-123',
    personId: 'cnt-123',
    status: 'PENDING',
    currentSubject: 'Valid Subject Line',
    currentBody: 'This is a valid body that exceeds 20 characters easily.',
    createdAt: mockDate,
    updatedAt: mockDate,
    person: mockContact,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      campaignMember: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      suppression: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApproveDraftUseCase,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    useCase = module.get<ApproveDraftUseCase>(ApproveDraftUseCase);
  });

  describe('execute', () => {
    it('should successfully approve a PENDING draft', async () => {
      prisma.campaignMember.findUnique
        .mockResolvedValueOnce(mockCampaignContact) // initial fetch
        .mockResolvedValueOnce({ ...mockCampaignContact, status: 'READY' }); // final fetch after update
      prisma.suppression.findUnique.mockResolvedValue(null);
      prisma.campaignMember.updateMany.mockResolvedValue({ count: 1 });

      const result = await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
      });

      expect(prisma.campaignMember.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'cc-123',
          updatedAt: mockDate,
          status: 'PENDING',
        },
        data: {
          status: 'READY',
        },
      });
      expect(result.status).toBe('READY');
    });

    it('should handle READY -> READY idempotently without mutation', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        status: 'READY',
      });
      prisma.suppression.findUnique.mockResolvedValue(null);

      const result = await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
      });

      // updateMany should not be called
      expect(prisma.campaignMember.updateMany).not.toHaveBeenCalled();

      // The contact relation should be stripped in the returned result
      expect((result as any).person).toBeUndefined();
      expect(result.status).toBe('READY');
    });

    it('should reject READY -> READY if recipient is suppressed', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        status: 'READY',
      });
      // Mock suppression to return a record
      prisma.suppression.findUnique.mockResolvedValue({ id: 'sup-123' });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppConflictException);
      expect(prisma.campaignMember.updateMany).not.toHaveBeenCalled();
    });

    it('should reject PENDING -> READY if recipient is suppressed', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(mockCampaignContact);
      // Mock suppression to return a record
      prisma.suppression.findUnique.mockResolvedValue({ id: 'sup-123' });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppConflictException);
    });

    it('should reject if contact has no email', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        person: { ...mockContact, email: null },
      });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('should normalize email before checking suppression', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        person: { ...mockContact, email: '   TeSt@ExAmple.com  ' },
      });
      prisma.suppression.findUnique.mockResolvedValue(null);
      prisma.campaignMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        status: 'READY',
      }); // final fetch

      await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
      });

      expect(prisma.suppression.findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_email: {
            workspaceId: 'ws-123',
            email: 'test@example.com', // canonicalized
          },
        },
      });
    });

    it('should throw AppValidationException if subject is too short', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        currentSubject: 'Hi', // < 3 chars
      });
      prisma.suppression.findUnique.mockResolvedValue(null);

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('should throw AppValidationException if body is too short', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        currentBody: 'Too short', // < 20 chars
      });
      prisma.suppression.findUnique.mockResolvedValue(null);

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('should throw AppConflictException on concurrent update', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(mockCampaignContact);
      prisma.suppression.findUnique.mockResolvedValue(null);
      // simulate race condition where 0 rows are updated
      prisma.campaignMember.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppConflictException);
    });

    it('should throw AppNotFoundException if campaignMember is not found', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(null);

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'non-existent',
        }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('should throw AppNotFoundException if cross-tenant access is attempted', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(mockCampaignContact);

      await expect(
        useCase.execute({
          workspaceId: 'different-ws',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('should throw AppConflictException if status is not PENDING or READY', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        status: 'GENERATING',
      });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppConflictException);
    });
  });
});
