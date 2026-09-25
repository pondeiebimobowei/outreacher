import {
  MarkContactRepliedUseCase,
  ContactStateTransitionException,
} from './mark-contact-replied.use-case';
import { PrismaService } from '../../../database/prisma.service';

describe('MarkContactRepliedUseCase', () => {
  let useCase: MarkContactRepliedUseCase;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    useCase = new MarkContactRepliedUseCase(prismaMock);
  });

  it('should successfully transition SENT to REPLIED and cancel PENDING jobs', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'contact-1',
        workspace_id: 'ws-1',
        status: 'SENT',
      },
    ]);

    await useCase.execute('contact-1', 'ws-1');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2); // SELECT and UPDATE
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1); // Cancel jobs
  });

  it('should successfully transition FOLLOW_UP_DUE to REPLIED and cancel PENDING jobs', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'contact-1',
        workspace_id: 'ws-1',
        status: 'FOLLOW_UP_DUE',
      },
    ]);

    await useCase.execute('contact-1', 'ws-1');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('should return idempotently if already REPLIED and still cancel PENDING jobs', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'contact-1',
        workspace_id: 'ws-1',
        status: 'REPLIED',
      },
    ]);

    await useCase.execute('contact-1', 'ws-1');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1); // Only SELECT
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1); // Still cancels jobs
  });

  it('should throw retryable exception if SENDING without cancelling jobs', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'contact-1',
        workspace_id: 'ws-1',
        status: 'SENDING',
      },
    ]);

    await expect(useCase.execute('contact-1', 'ws-1')).rejects.toThrow(
      ContactStateTransitionException,
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('should throw terminal exception if PENDING without cancelling jobs', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: 'contact-1',
        workspace_id: 'ws-1',
        status: 'PENDING',
      },
    ]);

    await expect(useCase.execute('contact-1', 'ws-1')).rejects.toThrow(
      ContactStateTransitionException,
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('should throw terminal exception if contact not found or tenant mismatch', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(useCase.execute('contact-1', 'ws-1')).rejects.toThrow(
      ContactStateTransitionException,
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });
});
