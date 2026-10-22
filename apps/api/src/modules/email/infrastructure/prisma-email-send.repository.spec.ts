import { EmailSendStatus, EmailSendType } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaEmailSendRepository } from './prisma-email-send.repository';

describe('PrismaEmailSendRepository', () => {
  let repository: PrismaEmailSendRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      emailSend: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    repository = new PrismaEmailSendRepository(mockPrisma as PrismaService);
  });

  describe('createReserved', () => {
    it('creates an EmailSend with status RESERVED and reservedAt', async () => {
      const now = new Date('2026-09-18T12:00:00Z');
      const mockResult = {
        id: 'send-1',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        campaignMemberId: 'cc-1',
        type: EmailSendType.INITIAL,
        subject: 'Hello',
        body: 'World',
        status: EmailSendStatus.RESERVED,
        reservedAt: now,
      };
      mockPrisma.emailSend.create.mockResolvedValue(mockResult);

      const result = await repository.createReserved({
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        campaignMemberId: 'cc-1',
        subject: 'Hello',
        body: 'World',
        reservedAt: now,
      });

      expect(result).toEqual(mockResult);
      expect(mockPrisma.emailSend.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          campaignMemberId: 'cc-1',
          type: EmailSendType.INITIAL,
          subject: 'Hello',
          body: 'World',
          status: EmailSendStatus.RESERVED,
          reservedAt: now,
        }),
      });
    });

    it('uses the provided transaction client when supplied', async () => {
      const txMock = {
        emailSend: {
          create: jest.fn().mockResolvedValue({ id: 'send-tx-1' }),
        },
      } as unknown as any;

      const result = await repository.createReserved(
        {
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          campaignMemberId: 'cc-1',
          subject: 'Hello',
          body: 'World',
        },
        txMock,
      );

      expect(result.id).toBe('send-tx-1');
      expect(txMock.emailSend.create).toHaveBeenCalled();
      expect(mockPrisma.emailSend.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('returns null if record not found in workspace', async () => {
      mockPrisma.emailSend.findFirst.mockResolvedValue(null);

      const result = await repository.updateStatus('ws-1', 'send-1', {
        status: EmailSendStatus.SENDING,
      });

      expect(result).toBeNull();
      expect(mockPrisma.emailSend.update).not.toHaveBeenCalled();
    });

    it('updates status and metadata when record is found', async () => {
      mockPrisma.emailSend.findFirst.mockResolvedValue({
        id: 'send-1',
        workspaceId: 'ws-1',
        status: EmailSendStatus.RESERVED,
        providerMessageId: null,
        messageId: null,
      });
      mockPrisma.emailSend.update.mockResolvedValue({
        id: 'send-1',
        workspaceId: 'ws-1',
        status: EmailSendStatus.SENT,
        providerMessageId: 'prov-123',
        messageId: '<msg-123@domain.com>',
      });

      const result = await repository.updateStatus('ws-1', 'send-1', {
        status: EmailSendStatus.SENT,
        providerMessageId: 'prov-123',
        messageId: '<msg-123@domain.com>',
      });

      expect(result?.status).toBe(EmailSendStatus.SENT);
      expect(mockPrisma.emailSend.update).toHaveBeenCalledWith({
        where: { id: 'send-1' },
        data: expect.objectContaining({
          status: EmailSendStatus.SENT,
          providerMessageId: 'prov-123',
          messageId: '<msg-123@domain.com>',
        }),
      });
    });
  });

  describe('findById', () => {
    it('queries by id and workspaceId', async () => {
      mockPrisma.emailSend.findFirst.mockResolvedValue({
        id: 'send-1',
        workspaceId: 'ws-1',
      });

      const result = await repository.findById('ws-1', 'send-1');

      expect(result?.id).toBe('send-1');
      expect(mockPrisma.emailSend.findFirst).toHaveBeenCalledWith({
        where: { id: 'send-1', workspaceId: 'ws-1' },
      });
    });
  });

  describe('findByCampaignContactId', () => {
    it('queries by campaignMemberId and workspaceId ordered by createdAt desc', async () => {
      mockPrisma.emailSend.findMany.mockResolvedValue([{ id: 'send-1' }]);

      const result = await repository.findByCampaignContactId('ws-1', 'cc-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.emailSend.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', campaignMemberId: 'cc-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
