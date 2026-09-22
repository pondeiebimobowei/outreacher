jest.mock('svix', () => ({ Webhook: jest.fn() }));
import { DeliveryWebhookService } from './delivery-webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { ISecretResolver } from '../domain/secret-resolver.interface';
import { ResendDeliveryEventAdapter } from '../infrastructure/resend-delivery-event.adapter';
import { ProcessDeliveryEventUseCase } from './process-delivery-event.use-case';
import { AppValidationException } from '../../../common/errors/application.exception';

describe('DeliveryWebhookService', () => {
  let service: DeliveryWebhookService;
  let prisma: any;
  let secretResolver: any;
  let resendAdapter: any;
  let processDeliveryEvent: any;

  beforeEach(() => {
    prisma = {
      integration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'int_123',
          workspaceId: 'ws_123',
          provider: 'RESEND',
          webhookSecretReference: 'secret_ref',
        }),
      },
    };

    secretResolver = {
      resolve: jest.fn().mockResolvedValue({ secret: 'whsec_secret' }),
    };

    resendAdapter = {
      verifySignature: jest.fn(),
      parsePayload: jest.fn(),
    };

    processDeliveryEvent = {
      execute: jest.fn(),
    };

    service = new DeliveryWebhookService(
      prisma as any,
      secretResolver as any,
      resendAdapter as any,
      processDeliveryEvent as any,
    );
  });

  it('should throw AppValidationException if signature is invalid', async () => {
    const req = {
      rawBody: Buffer.from('test'),
      headers: { 'svix-signature': 'bad' },
    };

    resendAdapter.verifySignature.mockImplementation(() => {
      throw new AppValidationException('Invalid webhook signature');
    });

    await expect(service.handleDelivery('int_123', req as any)).rejects.toThrow('Invalid webhook signature');
    expect(resendAdapter.verifySignature).toHaveBeenCalled();
    expect(resendAdapter.parsePayload).not.toHaveBeenCalled();
    expect(processDeliveryEvent.execute).not.toHaveBeenCalled();
  });

  it('should process webhook when signature is valid', async () => {
    const req = {
      rawBody: Buffer.from('test'),
      headers: { 'svix-signature': 'good' },
    };

    resendAdapter.verifySignature.mockReturnValue(undefined);
    resendAdapter.parsePayload.mockReturnValue({
      status: 'VALID',
      event: { providerEventId: 'evt_1', type: 'email.sent' }
    });

    await service.handleDelivery('int_123', req as any);

    expect(resendAdapter.verifySignature).toHaveBeenCalled();
    expect(resendAdapter.parsePayload).toHaveBeenCalled();
    expect(processDeliveryEvent.execute).toHaveBeenCalled();
  });
});
