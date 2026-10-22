import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { ProcessDeliveryEventUseCase } from './process-delivery-event.use-case';
import { EmailEventType, SuppressionReason } from '@repo/db';
import { CanonicalDeliveryEvent } from '../domain/delivery-event-provider.adapter';
import { randomUUID } from 'crypto';
import { AppConflictException } from '../../../common/errors/application.exception';
import { ConfigModule } from '@nestjs/config';

jest.unmock('@repo/db');

describe('ProcessDeliveryEventUseCase (Integration)', () => {
  let moduleRef: TestingModule;
  let useCase: ProcessDeliveryEventUseCase;
  let prisma: PrismaService;

  let workspaceId: string;
  let companyId: string;
  let campaignId: string;
  let personId: string;
  let campaignMemberId: string;
  let emailSendId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [PrismaService, ProcessDeliveryEventUseCase],
    }).compile();

    useCase = moduleRef.get(ProcessDeliveryEventUseCase);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    workspaceId = randomUUID();
    companyId = randomUUID();
    campaignId = randomUUID();
    personId = randomUUID();
    campaignMemberId = randomUUID();
    emailSendId = randomUUID();

    await prisma.$executeRaw`INSERT INTO workspaces (id, name, updated_at) VALUES (${workspaceId}, 'Test Workspace', NOW())`;
    await prisma.$executeRaw`INSERT INTO companies (id, workspace_id, name, normalized_name, domain, updated_at) VALUES (${companyId}, ${workspaceId}, 'Test Company', 'test-company', 'test.com', NOW())`;
    await prisma.$executeRaw`INSERT INTO campaigns (id, workspace_id, company_id, name, normalized_name, status, updated_at) VALUES (${campaignId}, ${workspaceId}, ${companyId}, 'Test', 'test', 'DRAFT', NOW())`;
    await prisma.$executeRaw`INSERT INTO contacts (id, workspace_id, company_id, email, name, updated_at) VALUES (${personId}, ${workspaceId}, ${companyId}, 'test@example.com', 'Test', NOW())`;
    await prisma.$executeRaw`INSERT INTO campaign_contacts (id, workspace_id, campaign_id, contact_id, status, updated_at) VALUES (${campaignMemberId}, ${workspaceId}, ${campaignId}, ${personId}, 'SENDING', NOW())`;
    await prisma.$executeRaw`INSERT INTO email_sends (id, workspace_id, campaign_id, campaign_contact_id, provider, provider_message_id, status, subject, body, updated_at) VALUES (${emailSendId}, ${workspaceId}, ${campaignId}, ${campaignMemberId}, 'RESEND', 'msg-123', 'SENT', 'Test', 'Test', NOW())`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  const createEvent = (
    providerEventId: string,
    providerMessageId: string,
    eventType: EmailEventType = EmailEventType.DELIVERED
  ): CanonicalDeliveryEvent => ({
    providerEventId,
    providerMessageId,
    recipientEmail: 'test@example.com',
    eventType,
    occurredAt: new Date(),
    rawPayload: { type: 'test' },
  });

  it('should atomicaly process delivery event and record idempotency', async () => {
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.DELIVERED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    await useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    });

    console.log('Keys of Prisma:', Object.keys(prisma).filter(k => !k.startsWith('_')));
    const emailEvent = await prisma.emailEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RESEND', providerEventId: evtId } }
    });
    expect(emailEvent).toBeDefined();
    expect(emailEvent?.emailSendId).toBe(emailSendId);

    const idempotency = await prisma.idempotencyRecord.findUnique({
      where: { workspaceId_key: { workspaceId, key: idempotencyKey } }
    });
    expect(idempotency).toBeDefined();

    const suppression = await prisma.suppression.findFirst({
      where: { workspaceId, email: 'test@example.com' }
    });
    expect(suppression).toBeNull(); // DELIVERED does not create suppression
  });

  it('should process BOUNCED event and create suppression', async () => {
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.BOUNCED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    await useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    });

    const suppression = await prisma.suppression.findUnique({
      where: { workspaceId_email: { workspaceId, email: 'test@example.com' } }
    });
    expect(suppression).toBeDefined();
    expect(suppression?.reason).toBe(SuppressionReason.BOUNCED);
  });

  it('should not overwrite existing suppression on subsequent DELIVERED or BOUNCED event', async () => {
    // Manually insert an initial suppression
    await prisma.suppression.create({
      data: {
        workspaceId,
        email: 'test@example.com',
        reason: SuppressionReason.USER_REQUEST,
        source: 'manual',
      }
    });

    // Process a BOUNCED event
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.BOUNCED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    await useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    });

    const suppression = await prisma.suppression.findUnique({
      where: { workspaceId_email: { workspaceId, email: 'test@example.com' } }
    });

    // Existing suppression must not be mutated
    expect(suppression?.reason).toBe(SuppressionReason.USER_REQUEST);
    expect(suppression?.source).toBe('manual');
  });

  it('should safely drop and return for unknown providerMessageId', async () => {
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-unknown', EmailEventType.DELIVERED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    await useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    });

    const emailEvent = await prisma.emailEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RESEND', providerEventId: evtId } }
    });
    expect(emailEvent).toBeNull();
  });

  it('CONCURRENCY TEST 1: Legitimate Duplicate (same providerEventId + same providerMessageId)', async () => {
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.BOUNCED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    // Fire concurrently
    const results = await Promise.allSettled([
      useCase.execute({ workspaceId, provider: 'RESEND', idempotencyKey, event }),
      useCase.execute({ workspaceId, provider: 'RESEND', idempotencyKey, event }),
      useCase.execute({ workspaceId, provider: 'RESEND', idempotencyKey, event }),
    ]);

    // All should succeed (one processes, others catch P2002 and return silently)
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    const emailEvents = await prisma.emailEvent.findMany({
      where: { providerEventId: evtId }
    });
    expect(emailEvents.length).toBe(1);

    const idempotencyRecords = await prisma.idempotencyRecord.findMany({
      where: { key: idempotencyKey }
    });
    expect(idempotencyRecords.length).toBe(1);

    const suppressions = await prisma.suppression.findMany({
      where: { workspaceId, email: 'test@example.com' }
    });
    expect(suppressions.length).toBe(1);
  });

  it('CONCURRENCY TEST 2: Adversarial Conflict (same providerEventId + DIFFERENT providerMessageId)', async () => {
    const emailSendId2 = randomUUID();
    await prisma.$executeRaw`INSERT INTO email_sends (id, workspace_id, campaign_id, campaign_contact_id, provider, provider_message_id, status, subject, body, updated_at) VALUES (${emailSendId2}, ${workspaceId}, ${campaignId}, ${campaignMemberId}, 'RESEND', 'msg-456', 'SENT', 'Test2', 'Test2', NOW())`;

    const evtId = randomUUID();
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    // First request
    await useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event: createEvent(evtId, 'msg-123', EmailEventType.DELIVERED),
    });

    // Second request (adversarial identity conflict)
    await expect(useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event: createEvent(evtId, 'msg-456', EmailEventType.DELIVERED),
    })).rejects.toThrow(AppConflictException);

    await expect(useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event: createEvent(evtId, 'msg-456', EmailEventType.DELIVERED),
    })).rejects.toMatchObject({ status: 409 });

    // Assert only the first was persisted
    const emailEvent = await prisma.emailEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RESEND', providerEventId: evtId } }
    });
    expect(emailEvent?.emailSendId).toBe(emailSendId); // It matched msg-123
  });

  it('should ignore event when emailSend belongs to a different workspace (cross-workspace isolation)', async () => {
    const otherWorkspaceId = randomUUID();
    await prisma.$executeRaw`INSERT INTO workspaces (id, name, updated_at) VALUES (${otherWorkspaceId}, 'Other Workspace', NOW())`;

    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.DELIVERED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    await useCase.execute({
      workspaceId: otherWorkspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    });

    const emailEvent = await prisma.emailEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RESEND', providerEventId: evtId } }
    });
    expect(emailEvent).toBeNull();
  });

  it('should rollback entirely if an error occurs within the transaction', async () => {
    const evtId = randomUUID();
    const event = createEvent(evtId, 'msg-123', EmailEventType.DELIVERED);
    const idempotencyKey = `webhook:delivery:RESEND:${evtId}`;

    const originalTransaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = jest.fn().mockImplementation(async (cb) => {
      await originalTransaction(async (tx) => {
        await cb(tx);
        throw new Error('Simulated internal transaction failure');
      });
    });

    await expect(useCase.execute({
      workspaceId,
      provider: 'RESEND',
      idempotencyKey,
      event,
    })).rejects.toThrow('Simulated internal transaction failure');

    prisma.$transaction = originalTransaction;

    const idempotency = await prisma.idempotencyRecord.findUnique({
      where: { workspaceId_key: { workspaceId, key: idempotencyKey } }
    });
    expect(idempotency).toBeNull();

    const emailEvent = await prisma.emailEvent.findUnique({
      where: { provider_providerEventId: { provider: 'RESEND', providerEventId: evtId } }
    });
    expect(emailEvent).toBeNull();
  });

});
