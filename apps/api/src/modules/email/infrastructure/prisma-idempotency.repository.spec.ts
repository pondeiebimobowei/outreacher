import { PrismaService } from '../../../database/prisma.service';
import { PrismaIdempotencyRepository } from './prisma-idempotency.repository';

describe('PrismaIdempotencyRepository', () => {
  let repository: PrismaIdempotencyRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      idempotencyRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    repository = new PrismaIdempotencyRepository(mockPrisma as PrismaService);
  });

  describe('findByKey', () => {
    it('queries using workspaceId and key', async () => {
      const mockRecord = {
        id: 'rec-1',
        workspaceId: 'ws-1',
        key: 'key-123',
        targetId: 'cc-1',
        responseStatus: 202,
        responseBody: { jobId: 'job-1' },
      };
      mockPrisma.idempotencyRecord.findFirst.mockResolvedValue(mockRecord);

      const result = await repository.findByKey('ws-1', 'key-123');

      expect(result).toEqual(mockRecord);
      expect(mockPrisma.idempotencyRecord.findFirst).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          key: 'key-123',
        },
      });
    });

    it('returns null if record not found', async () => {
      mockPrisma.idempotencyRecord.findFirst.mockResolvedValue(null);

      const result = await repository.findByKey('ws-1', 'missing-key');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates an idempotency record with provided payload and default status 202', async () => {
      const input = {
        workspaceId: 'ws-1',
        key: 'key-123',
        route: '/api/v1/outreaches/:id/send',
        targetId: 'outreach-1',
        jobId: 'job-1',
        responseBody: { jobId: 'job-1', message: 'Dispatch enqueued' },
      };
      const mockCreated = {
        ...input,
        id: 'rec-1',
        responseStatus: 202,
        createdAt: new Date(),
      };
      mockPrisma.idempotencyRecord.create.mockResolvedValue(mockCreated);

      const result = await repository.create(input);

      expect(result).toEqual(mockCreated);
      expect(mockPrisma.idempotencyRecord.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          key: 'key-123',
          operation: '/api/v1/outreaches/:id/send',
          requestHash: '',
          targetId: 'outreach-1',
          jobId: 'job-1',
          responseStatus: 202,
          responseBody: { jobId: 'job-1', message: 'Dispatch enqueued' },
        },
      });
    });

    it('uses the provided transaction client when supplied', async () => {
      const txMock = {
        idempotencyRecord: {
          create: jest.fn().mockResolvedValue({ id: 'rec-tx-1' }),
        },
      } as unknown as any;

      const result = await repository.create(
        {
          workspaceId: 'ws-1',
          key: 'key-123',
          route: '/api/v1/outreaches/:id/send',
          targetId: 'outreach-1',
          responseBody: { ok: true },
        },
        txMock,
      );

      expect(result.id).toBe('rec-tx-1');
      expect(txMock.idempotencyRecord.create).toHaveBeenCalled();
      expect(mockPrisma.idempotencyRecord.create).not.toHaveBeenCalled();
    });
  });
});
