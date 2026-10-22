import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateDraftUseCase } from './update-draft.use-case';
import { UpdateDraftRequestDto } from '../dto/update-draft-request.dto';
import { PrismaService } from '../../../database/prisma.service';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';

describe('UpdateDraftUseCase & UpdateDraftRequestDto', () => {
  let useCase: UpdateDraftUseCase;
  let prisma: any;

  const mockCampaignContact = {
    id: 'cc-123',
    workspaceId: 'ws-123',
    campaignId: 'cmp-123',
    personId: 'cnt-123',
    status: 'PENDING',
    currentSubject: 'Original Subject Line',
    currentBody:
      'Original Body Text that meets the minimum length requirement.',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      campaignMember: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateDraftUseCase,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get<UpdateDraftUseCase>(UpdateDraftUseCase);
  });

  describe('DTO Validation (UpdateDraftRequestDto)', () => {
    it('accepts valid subject and bodyText and trims whitespace', async () => {
      const plain = {
        subject: '  New Subject Line  ',
        bodyText:
          '  New Body Text that meets the minimum length requirement.  ',
      };
      const dto = plainToInstance(UpdateDraftRequestDto, plain);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.subject).toBe('New Subject Line');
      expect(dto.bodyText).toBe(
        'New Body Text that meets the minimum length requirement.',
      );
    });

    it('rejects empty object when neither subject nor bodyText is provided', async () => {
      const dto = plainToInstance(UpdateDraftRequestDto, {});
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const guardError = errors.find((e) => e.property === '_atLeastOneGuard');
      expect(guardError).toBeDefined();
    });

    it('rejects whitespace-only subject', async () => {
      const dto = plainToInstance(UpdateDraftRequestDto, {
        subject: '   ',
        bodyText: 'Valid body text that meets the minimum length requirement.',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const subjectError = errors.find((e) => e.property === 'subject');
      expect(subjectError).toBeDefined();
    });

    it('rejects subject under 3 characters', async () => {
      const dto = plainToInstance(UpdateDraftRequestDto, {
        subject: 'Hi',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects bodyText under 20 characters', async () => {
      const dto = plainToInstance(UpdateDraftRequestDto, {
        bodyText: 'Too short',
      });
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Use Case Logic (UpdateDraftUseCase)', () => {
    it('updates subject while retaining existing bodyText (partial update)', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(mockCampaignContact);
      prisma.campaignMember.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...mockCampaignContact, ...data }),
      );

      const result = await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
        subject: ' Updated Subject ',
      });

      expect(prisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: 'cc-123' },
        data: {
          currentSubject: 'Updated Subject',
          currentBody: mockCampaignContact.currentBody,
          status: 'PENDING',
        },
      });
      expect(result.currentSubject).toBe('Updated Subject');
      expect(result.currentBody).toBe(mockCampaignContact.currentBody);
      expect(result.status).toBe('PENDING');
    });

    it('updates bodyText while retaining existing subject (partial update)', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(mockCampaignContact);
      prisma.campaignMember.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...mockCampaignContact, ...data }),
      );

      const newBody =
        'This is a newly updated body text that exceeds twenty characters easily.';
      const result = await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
        bodyText: newBody,
      });

      expect(prisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: 'cc-123' },
        data: {
          currentSubject: mockCampaignContact.currentSubject,
          currentBody: newBody,
          status: 'PENDING',
        },
      });
      expect(result.currentSubject).toBe(mockCampaignContact.currentSubject);
      expect(result.currentBody).toBe(newBody);
    });

    it('resets status to PENDING when editing an approved READY draft (Model B invariant)', async () => {
      const readyContact = {
        ...mockCampaignContact,
        status: 'READY',
      };
      prisma.campaignMember.findUnique.mockResolvedValue(readyContact);
      prisma.campaignMember.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...readyContact, ...data }),
      );

      const result = await useCase.execute({
        workspaceId: 'ws-123',
        campaignMemberId: 'cc-123',
        subject: 'New Subject for Approved Draft',
      });

      expect(result.status).toBe('PENDING');
      expect(prisma.campaignMember.update).toHaveBeenCalledWith({
        where: { id: 'cc-123' },
        data: {
          currentSubject: 'New Subject for Approved Draft',
          currentBody: readyContact.currentBody,
          status: 'PENDING',
        },
      });
    });

    it('rejects editing when contact is in active or terminal state (SCHEDULED, SENT, etc.)', async () => {
      const scheduledContact = {
        ...mockCampaignContact,
        status: 'SCHEDULED',
      };
      prisma.campaignMember.findUnique.mockResolvedValue(scheduledContact);

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
          subject: 'New Subject',
        }),
      ).rejects.toThrow(AppConflictException);

      expect(prisma.campaignMember.update).not.toHaveBeenCalled();
    });

    it('rejects edit on cross-tenant access attempt', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue({
        ...mockCampaignContact,
        workspaceId: 'ws-OTHER',
      });

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
          subject: 'New Subject',
        }),
      ).rejects.toThrow(AppNotFoundException);

      expect(prisma.campaignMember.update).not.toHaveBeenCalled();
    });

    it('throws AppNotFoundException if CampaignMember does not exist', async () => {
      prisma.campaignMember.findUnique.mockResolvedValue(null);

      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-nonexistent',
          subject: 'New Subject',
        }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('throws AppValidationException if neither subject nor bodyText is provided', async () => {
      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws AppValidationException if subject is too short or whitespace only', async () => {
      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
          subject: '   ',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws AppValidationException if bodyText is too short', async () => {
      await expect(
        useCase.execute({
          workspaceId: 'ws-123',
          campaignMemberId: 'cc-123',
          bodyText: 'Short body',
        }),
      ).rejects.toThrow(AppValidationException);
    });
  });
});
