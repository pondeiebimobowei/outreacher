import { Test, TestingModule } from '@nestjs/testing';
import { ReplyCorrelationService } from './reply-correlation.service';
import { PrismaService } from '../../../database/prisma.service';

describe('ReplyCorrelationService', () => {
  let service: ReplyCorrelationService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      emailSend: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyCorrelationService,
        { provide: PrismaService, useValue: prismaMock }
      ],
    }).compile();

    service = module.get<ReplyCorrelationService>(ReplyCorrelationService);
  });

  const mockInbound = {
    workspaceId: 'ws-1',
  } as any;

  it('Rule 1: Correlates by exact token match, ignoring In-Reply-To and References', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue({ id: 'es-1', campaignMemberId: 'contact-a', workspaceId: 'ws-1' });
    
    const result = await service.correlate(mockInbound, 'reply+TOKEN123@domain.com', 'in-reply-to-b', ['ref-c']);
    
    expect(result.status).toBe('CORRELATED');
    expect((result as any).campaignMemberId).toBe('contact-a');
    expect(prismaMock.emailSend.findUnique).toHaveBeenCalledWith({ where: { replyToToken: 'TOKEN123' }, select: expect.any(Object) });
    expect(prismaMock.emailSend.findFirst).not.toHaveBeenCalled();
  });

  it('Rule 2: Correlates by In-Reply-To if no token match, ignoring References', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue(null);
    prismaMock.emailSend.findMany.mockResolvedValue([{ id: 'es-1', campaignMemberId: 'contact-a' }]);
    
    const result = await service.correlate(mockInbound, 'normal@domain.com', '<msg-a>', ['msg-b']);
    
    expect(result.status).toBe('CORRELATED');
    expect((result as any).campaignMemberId).toBe('contact-a');
    expect(prismaMock.emailSend.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1', messageId: '<msg-a>' }, select: expect.any(Object), orderBy: { createdAt: 'desc' } });
  });

  it('Rule 3: Correlates by References if no token or In-Reply-To match', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue(null);
    prismaMock.emailSend.findMany.mockResolvedValue([{ id: 'es-1', campaignMemberId: 'contact-a' }]);
    
    const result = await service.correlate(mockInbound, 'normal@domain.com', null, ['<msg-a>', 'msg-b']);
    
    expect(result.status).toBe('CORRELATED');
    expect((result as any).campaignMemberId).toBe('contact-a');
    expect(prismaMock.emailSend.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', messageId: { in: ['<msg-a>', '<msg-b>'] } },
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' }
    });
  });

  it('Rule 3: Returns AMBIGUOUS if References match multiple distinct contacts', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue(null);
    
    prismaMock.emailSend.findMany.mockResolvedValue([
      { id: 'es-1', campaignMemberId: 'contact-a' },
      { id: 'es-2', campaignMemberId: 'contact-b' }
    ]);
    
    const result = await service.correlate(mockInbound, 'normal@domain.com', null, ['msg-a', 'msg-b']);
    
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('Rule 3: Returns CORRELATED if References match multiple messages that map to the SAME contact', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue(null);
    
    prismaMock.emailSend.findMany.mockResolvedValue([
      { id: 'es-2', campaignMemberId: 'contact-a' },
      { id: 'es-1', campaignMemberId: 'contact-a' }
    ]);
    
    const result = await service.correlate(mockInbound, 'normal@domain.com', null, ['msg-old-1', 'msg-old-2']);
    
    expect(result.status).toBe('CORRELATED');
    expect((result as any).campaignMemberId).toBe('contact-a');
  });

  it('Returns UNCORRELATED if no matches found', async () => {
    prismaMock.emailSend.findUnique.mockResolvedValue(null);
    
    prismaMock.emailSend.findMany.mockResolvedValue([]);
    
    const result = await service.correlate(mockInbound, 'normal@domain.com', null, []);
    
    expect(result.status).toBe('UNCORRELATED');
  });
});
