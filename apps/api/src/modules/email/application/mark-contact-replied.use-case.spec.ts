import { MarkContactRepliedUseCase, ContactStateTransitionException } from './mark-contact-replied.use-case';
import { PrismaService } from '../../../database/prisma.service';

describe('MarkContactRepliedUseCase', () => {
  let useCase: MarkContactRepliedUseCase;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $queryRaw: jest.fn(),
    };
    useCase = new MarkContactRepliedUseCase(prismaMock as unknown as PrismaService);
  });

  it('should successfully transition SENT to REPLIED', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{
      id: 'contact-1',
      workspace_id: 'ws-1',
      status: 'SENT'
    }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await useCase.execute('contact-1', 'ws-1');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    // 2nd call should be the update
    const updateCall = prismaMock.$queryRaw.mock.calls[1][0];
    expect(updateCall[0]).toContain("UPDATE campaign_contacts");
    expect(updateCall[0]).toContain("SET status = 'REPLIED'");
  });

  it('should successfully transition FOLLOW_UP_DUE to REPLIED', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{
      id: 'contact-1',
      workspace_id: 'ws-1',
      status: 'FOLLOW_UP_DUE'
    }]);
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await useCase.execute('contact-1', 'ws-1');

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('should return idempotently if already REPLIED', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{
      id: 'contact-1',
      workspace_id: 'ws-1',
      status: 'REPLIED'
    }]);

    await useCase.execute('contact-1', 'ws-1');

    // Only the select query, no update
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

    it('should throw retryable exception if SENDING', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{
      id: 'contact-1',
      workspace_id: 'ws-1',
      status: 'SENDING'
    }]);

    try {
      await useCase.execute('contact-1', 'ws-1');
      fail('Should have thrown ContactStateTransitionException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ContactStateTransitionException);
      expect(e.isRetryable).toBe(true);
    }
  });

    it('should throw terminal exception if PENDING', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{
      id: 'contact-1',
      workspace_id: 'ws-1',
      status: 'PENDING'
    }]);

    try {
      await useCase.execute('contact-1', 'ws-1');
      fail('Should have thrown ContactStateTransitionException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ContactStateTransitionException);
      expect(e.isRetryable).toBe(false);
    }
  });

    it('should throw terminal exception if contact not found or tenant mismatch', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    try {
      await useCase.execute('contact-1', 'ws-1');
      fail('Should have thrown ContactStateTransitionException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ContactStateTransitionException);
      expect(e.isRetryable).toBe(false);
    }
  });
});
