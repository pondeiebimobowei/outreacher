jest.mock('svix', () => ({ Webhook: jest.fn() }));
import { InboundWebhookService } from './inbound-webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { ResendInboundEmailAdapter } from '../infrastructure/resend-inbound-email.adapter';
import {
  AppValidationException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { ISecretResolver } from '../domain/secret-resolver.interface';
import { Test, TestingModule } from '@nestjs/testing';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';

describe('InboundWebhookService', () => {
  let service: InboundWebhookService;
  let prisma: PrismaService;
  let secretResolver: ISecretResolver;
  let adapter: ResendInboundEmailAdapter;

  const mockPrisma = {
    integration: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockSecretResolver = {
    resolve: jest.fn(),
  };

  const mockAdapter = {
    verifySignature: jest.fn(),
    parsePayload: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SECRET_RESOLVER_TOKEN, useValue: mockSecretResolver },
        { provide: ResendInboundEmailAdapter, useValue: mockAdapter },
      ],
    }).compile();

    service = module.get<InboundWebhookService>(InboundWebhookService);
    prisma = module.get<PrismaService>(PrismaService);
    secretResolver = module.get<ISecretResolver>(SECRET_RESOLVER_TOKEN);
    adapter = module.get<ResendInboundEmailAdapter>(ResendInboundEmailAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw AppValidationException if rawBody is missing', async () => {
    await expect(
      service.handleInbound('integration-1', { rawBody: undefined } as any),
    ).rejects.toThrow(new AppValidationException('Raw body is missing'));
  });

  it('should throw AppNotFoundException if integration not found', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue(null);
    await expect(
      service.handleInbound('integration-1', {
        rawBody: Buffer.from(''),
      } as any),
    ).rejects.toThrow(new AppNotFoundException('Integration not found'));
  });

  it('should throw AppValidationException if integration is not RESEND', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      id: 'integration-1',
      provider: 'SMTP',
    });
    await expect(
      service.handleInbound('integration-1', {
        rawBody: Buffer.from(''),
      } as any),
    ).rejects.toThrow(
      new AppValidationException(
        'Provider SMTP is not supported for inbound webhooks in this adapter',
      ),
    );
  });

  it('should throw AppValidationException if integration missing webhookSecretReference', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      id: 'integration-1',
      provider: 'RESEND',
      webhookSecretReference: null,
    });
    await expect(
      service.handleInbound('integration-1', {
        rawBody: Buffer.from(''),
      } as any),
    ).rejects.toThrow(
      new AppValidationException(
        'Integration is not configured for inbound webhooks',
      ),
    );
  });

  it('should execute transaction and save properly', async () => {
    const integration = {
      id: 'integration-1',
      workspaceId: 'workspace-1',
      provider: 'RESEND',
      webhookSecretReference: 'vault://test#secret',
    };
    mockPrisma.integration.findUnique.mockResolvedValue(integration);

    mockSecretResolver.resolve.mockResolvedValue({
      provider: 'WEBHOOK',
      secret: 'whsec_test',
    });

    const canonicalPayload = {
      providerEventId: 'evt-123',
      providerEmailId: 'email-123',
      messageId: 'mid-123',
      inReplyTo: null,
      references: [],
      replyToToken: null,
      fromEmail: 'sender@example.com',
      fromName: 'Sender',
      toEmail: 'us@example.com',
      subject: 'Re: test',
      bodyText: null,
      bodyHtml: null,
      receivedAt: new Date(),
    };
    mockAdapter.parsePayload.mockReturnValue(canonicalPayload);

    // Mock transaction behavior
    const mockTx = {
      inboundReply: { create: jest.fn().mockResolvedValue({ id: 'reply-1' }) },
      job: { create: jest.fn() },
      idempotencyRecord: { create: jest.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      await cb(mockTx);
    });

    await service.handleInbound('integration-1', {
      rawBody: Buffer.from('raw'),
      headers: {},
    } as any);

    expect(mockAdapter.verifySignature).toHaveBeenCalledWith({
      rawBody: Buffer.from('raw'),
      headers: {},
      secret: 'whsec_test',
    });

    expect(mockTx.inboundReply.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          providerEventId: 'evt-123',
          providerEmailId: 'email-123',
          provider: 'RESEND',
        }),
      }),
    );

    expect(mockTx.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          workspaceId: 'workspace-1',
          type: 'WEBHOOK_PROCESSING',
          idempotencyKey: 'webhook:RESEND:evt-123',
          payload: {
            inboundReplyId: 'reply-1',
            integrationId: 'integration-1',
          },
        },
      }),
    );

    expect(mockTx.idempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          key: 'webhook:RESEND:evt-123',
        }),
      }),
    );
  });

  it('should swallow P2002 duplicate errors for idempotency', async () => {
    mockPrisma.integration.findUnique.mockResolvedValue({
      id: 'integration-1',
      workspaceId: 'workspace-1',
      provider: 'RESEND',
      webhookSecretReference: 'vault://test#secret',
    });
    mockSecretResolver.resolve.mockResolvedValue({
      provider: 'WEBHOOK',
      secret: 'whsec_test',
    });
    mockAdapter.parsePayload.mockReturnValue({ providerEventId: 'evt-123' });

    const err = Object.assign(new Error('duplicate'), {
      code: 'P2002',
      meta: { target: ['key'] },
    });
    mockPrisma.$transaction.mockRejectedValue(err);

    // Should resolve successfully
    await expect(
      service.handleInbound('integration-1', {
        rawBody: Buffer.from('raw'),
      } as any),
    ).resolves.not.toThrow();
  });
});
