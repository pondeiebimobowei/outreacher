import { Test, TestingModule } from '@nestjs/testing';
import { InboundReplyWorker } from './inbound-reply.worker';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';
import { ReplyCorrelationService } from '../domain/reply-correlation.service';
import { InboundRetrievalException, InboundRetrievalErrorCode } from '../infrastructure/resend-inbound-content.adapter';

describe('InboundReplyWorker', () => {
  let worker: InboundReplyWorker;
  let prismaMock: any;
  let adapterRegistryMock: any;
  let secretResolverMock: any;
  let correlationServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn((cb) => cb(prismaMock)),
      inboundReply: { findUnique: jest.fn(), update: jest.fn() },
      integration: { findFirst: jest.fn() },
      campaignContact: { findUnique: jest.fn() },
      job: { update: jest.fn(), updateMany: jest.fn() }
    };

    adapterRegistryMock = {
      getAdapter: jest.fn().mockReturnValue({
        getEmailDetails: jest.fn()
      })
    };

    secretResolverMock = {
      resolve: jest.fn().mockResolvedValue({ apiKey: 'test-key' })
    };

    correlationServiceMock = {
      correlate: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundReplyWorker,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SECRET_RESOLVER_TOKEN, useValue: secretResolverMock },
        { provide: INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN, useValue: adapterRegistryMock },
        { provide: ReplyCorrelationService, useValue: correlationServiceMock }
      ]
    }).compile();

    worker = module.get<InboundReplyWorker>(InboundReplyWorker);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockJob = {
    id: 'job-1',
    leaseVersion: 1,
    attemptCount: 0,
    maxAttempts: 3,
    payload: { inboundReplyId: 'reply-1' }
  };

  const mockInboundReply = {
    id: 'reply-1',
    workspaceId: 'ws-1',
    provider: 'RESEND',
    providerEmailId: 'email-1',
    messageId: 'msg-1'
  };

  it('completes the job on successful retrieval and correlation', async () => {
    prismaMock.$queryRaw.mockResolvedValue([mockJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValue({
      providerEmailId: 'email-1',
      messageId: 'msg-1',
      inReplyTo: 'in-reply-to',
      references: [],
      text: 'text',
      html: 'html'
    });

    correlationServiceMock.correlate.mockResolvedValue({ status: 'CORRELATED', campaignContactId: 'contact-1' });
    prismaMock.campaignContact.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'COMPLETED' })
    });
    expect(prismaMock.inboundReply.update).toHaveBeenCalledWith({
      where: { id: 'reply-1' },
      data: expect.objectContaining({
        status: 'CORRELATED',
        campaignContactId: 'contact-1',
        bodyText: 'text'
      })
    });
  });

  it('fails terminally if data integrity check fails', async () => {
    prismaMock.$queryRaw.mockResolvedValue([mockJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValue({
      providerEmailId: 'DIFFERENT-EMAIL-ID', // Mismatch!
      messageId: 'msg-1',
    });

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'DEAD_LETTER' })
    });
  });

  it('fails transiently if adapter throws retryable exception and attempts < maxAttempts', async () => {
    prismaMock.$queryRaw.mockResolvedValue([mockJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockRejectedValue(
      new InboundRetrievalException('Temp fail', InboundRetrievalErrorCode.PROVIDER_ERROR, true, 503)
    );

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'PENDING', attemptCount: 1 })
    });
  });

  it('fails terminally if adapter throws retryable exception but maxAttempts reached', async () => {
    const exhaustedJob = { ...mockJob, attemptCount: 2 }; // max is 3, next attempt is 3
    prismaMock.$queryRaw.mockResolvedValue([exhaustedJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockRejectedValue(
      new InboundRetrievalException('Temp fail', InboundRetrievalErrorCode.PROVIDER_ERROR, true, 503)
    );

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'DEAD_LETTER', attemptCount: 3 })
    });
  });

  it('fails terminally if adapter throws non-retryable exception', async () => {
    prismaMock.$queryRaw.mockResolvedValue([mockJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockRejectedValue(
      new InboundRetrievalException('Not found', InboundRetrievalErrorCode.NOT_FOUND, false, 404)
    );

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'DEAD_LETTER' })
    });
  });

  it('fails terminally if correlated contact belongs to different workspace', async () => {
    prismaMock.$queryRaw.mockResolvedValue([mockJob]);
    prismaMock.inboundReply.findUnique.mockResolvedValue(mockInboundReply);
    prismaMock.integration.findFirst.mockResolvedValue({ workspaceId: 'ws-1', webhookSecretReference: 'sec', provider: 'RESEND' });
    
    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValue({
      providerEmailId: 'email-1',
      messageId: 'msg-1',
    });

    correlationServiceMock.correlate.mockResolvedValue({ status: 'CORRELATED', campaignContactId: 'contact-1' });
    
    // Mismatch!
    prismaMock.campaignContact.findUnique.mockResolvedValue({ workspaceId: 'ws-DIFFERENT' });

    await (worker as any).claimAndProcessJobs();

    expect(prismaMock.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1', leaseVersion: 1 },
      data: expect.objectContaining({ status: 'DEAD_LETTER' })
    });
  });
});
