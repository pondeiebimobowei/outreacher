import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { MarkContactRepliedUseCase } from './mark-contact-replied.use-case';
import { InboundReplyWorker } from './inbound-reply.worker';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';
import { ReplyCorrelationService } from '../domain/reply-correlation.service';
import {
  InboundRetrievalErrorCode,
  InboundRetrievalException,
} from '../infrastructure/resend-inbound-content.adapter';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@repo/db';
import {
  setupTestDatabase,
  teardownTestDatabase,
} from '../../../../test/helpers/db-test-harness';
import { JobStatus, JobType } from '@repo/db';

describe('InboundReplyWorker Database Integration', () => {
  let prisma: PrismaClient;
  let worker: InboundReplyWorker;
  let adapterRegistryMock: any;
  let secretResolverMock: any;
  let correlationServiceMock: any;
  let markContactRepliedUseCase: MarkContactRepliedUseCase;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await prisma.job.deleteMany();
    await prisma.campaignMember.deleteMany();
    await prisma.person.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.company.deleteMany();
    await prisma.inboundReply.deleteMany();
    adapterRegistryMock = {
      getAdapter: jest.fn().mockReturnValue({
        getEmailDetails: jest.fn(),
      }),
    };

    secretResolverMock = {
      resolve: jest.fn().mockResolvedValue({ apiKey: 'test-key' }),
    };

    correlationServiceMock = {
      correlate: jest.fn(),
    };

    const prismaServiceMock = {
      $transaction: prisma.$transaction.bind(prisma),
      $queryRaw: prisma.$queryRaw.bind(prisma),
      job: prisma.job,
      inboundReply: prisma.inboundReply,
      integration: prisma.integration,
      workspace: prisma.workspace,
      campaignMember: prisma.campaignMember,
      campaign: prisma.campaign,
      person: prisma.person,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundReplyWorker,
        { provide: PrismaService, useValue: prismaServiceMock },
        {
          provide: INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN,
          useValue: adapterRegistryMock,
        },
        { provide: SECRET_RESOLVER_TOKEN, useValue: secretResolverMock },
        { provide: ReplyCorrelationService, useValue: correlationServiceMock },
        {
          provide: MarkContactRepliedUseCase,
          useClass: MarkContactRepliedUseCase,
        },
      ],
    }).compile();

    worker = module.get<InboundReplyWorker>(InboundReplyWorker);
    (worker as any).isRunning = false;
  });

  it('should claim pending job, handle temporary failure, and move availableAt forward', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace' },
    });

    await prisma.integration.create({
      data: {
        id: integrationId,
        workspaceId,
        provider: 'RESEND',
        name: 'Test',
        secretReference: 'sec-ref',
      },
    });

    await prisma.inboundReply.create({
      data: {
        id: inboundReplyId,
        workspaceId,
        provider: 'RESEND',
        providerEventId: 'evt-test-temp',
        providerEmailId: 'email-test',
        status: 'UNCORRELATED',
        fromEmail: 'test@test.com',
        toEmail: 'me@me.com',
      },
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId },
      },
    });

    adapterRegistryMock
      .getAdapter()
      .getEmailDetails.mockRejectedValueOnce(
        new InboundRetrievalException('Temp error', 'PROVIDER_ERROR', true),
      );

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
    });

    expect(updatedJob.status).toBe('PENDING');
    expect(updatedJob.attemptCount).toBe(1);
    expect(updatedJob.leaseVersion).toBe(1);
    expect(updatedJob.startedAt).not.toBeNull();
    expect(updatedJob.availableAt?.getTime()).toBeGreaterThan(Date.now());
    expect(updatedJob.lastError).toBe('Temp error');
  });

  it('should recover stale RUNNING job', async () => {
    const workspaceId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 2' },
    });

    const staleTime = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'RUNNING',
        payload: { test: true },
        updatedAt: staleTime,
        leaseVersion: 1,
      },
    });

    (worker as any).isRunning = true;
    await worker.recoverStaleJobs();
    (worker as any).isRunning = false;

    const recoveredJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
    });

    expect(recoveredJob.status).toBe('PENDING');
    expect(recoveredJob.leaseVersion).toBe(2);
  });

  it('should process job and save retrieved data when CORRELATED', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();
    const campaignMemberId = randomUUID();
    const campaignId = randomUUID();
    const personId = randomUUID();
    const companyId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 3' },
    });

    await prisma.integration.create({
      data: {
        id: integrationId,
        workspaceId,
        provider: 'RESEND',
        name: 'Test 3',
        secretReference: 'sec-ref',
      },
    });

    await prisma.company.create({
      data: {
        id: companyId,
        workspaceId,
        name: 'Comp',
        normalizedName: 'comp',
      },
    });
    await prisma.campaign.create({
      data: {
        id: campaignId,
        workspaceId,
        companyId,
        name: 'Camp',
        normalizedName: 'camp',
        status: 'DRAFT',
        sendingIdentity: 'ME',
      },
    });
    await prisma.person.create({
      data: {
        id: personId,
        workspaceId,
        companyId,
        personKind: 'PERSON',
        name: 'John Doe',
      },
    });
    await prisma.campaignMember.create({
      data: {
        id: campaignMemberId,
        workspaceId,
        campaignId,
        personId,
        targetRole: 'test',
        status: 'SENT',
      },
    });

    await prisma.inboundReply.create({
      data: {
        id: inboundReplyId,
        workspaceId,
        provider: 'RESEND',
        providerEventId: 'evt-corr',
        providerEmailId: 'email-corr',
        status: 'UNCORRELATED', // starts as uncorrelated
        fromEmail: 'test@test.com',
        toEmail: 'me@me.com',
      },
    });

    const followUpJobId = randomUUID();
    await prisma.job.create({
      data: {
        id: followUpJobId,
        workspaceId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        status: 'PENDING',
        payload: { campaignMemberId },
      },
    });

    // Also add an unrelated job to ensure it's not touched
    const unrelatedJobId = randomUUID();
    await prisma.job.create({
      data: {
        id: unrelatedJobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: 'PENDING',
        payload: { campaignMemberId },
      },
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId },
      },
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-corr',
      messageId: '<retrieved-msg-id>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: '<in-reply>',
      references: ['<in-reply>'],
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'CORRELATED',
      campaignMemberId,
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({
      where: { id: inboundReplyId },
    });
    expect(updatedReply.status).toBe('CORRELATED');

    const contactAfter = await prisma.campaignMember.findUniqueOrThrow({
      where: { id: campaignMemberId },
    });
    expect(contactAfter.status).toBe('REPLIED');
    expect(updatedReply.campaignMemberId).toBe(campaignMemberId);
    expect(updatedReply.bodyText).toBe('hello');
    expect(updatedReply.messageId).toBe('<retrieved-msg-id>');

    // 10E Verification: Follow-up jobs must be cancelled
    const followUpJob = await prisma.job.findUniqueOrThrow({
      where: { id: followUpJobId },
    });
    expect(followUpJob.status).toBe('COMPLETED');
    expect(followUpJob.lastError).toBe('Cancelled due to inbound reply');

    // Unrelated jobs should not be touched
    const unrelatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: unrelatedJobId },
    });
    expect(unrelatedJob.status).toBe('PENDING');
  });

  it('should process job and set status to UNCORRELATED', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 4' },
    });

    await prisma.integration.create({
      data: {
        id: integrationId,
        workspaceId,
        provider: 'RESEND',
        name: 'Test 4',
        secretReference: 'sec-ref',
      },
    });

    await prisma.inboundReply.create({
      data: {
        id: inboundReplyId,
        workspaceId,
        provider: 'RESEND',
        providerEventId: 'evt-uncorr',
        providerEmailId: 'email-uncorr',
        status: 'UNCORRELATED',
        fromEmail: 'test@test.com',
        toEmail: 'me@me.com',
      },
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId },
      },
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-uncorr',
      messageId: '<retrieved-msg-id-2>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: null,
      references: [],
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'UNCORRELATED',
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({
      where: { id: inboundReplyId },
    });
    expect(updatedReply.status).toBe('UNCORRELATED');
  });

  it('should process job and set status to AMBIGUOUS', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 5' },
    });

    await prisma.integration.create({
      data: {
        id: integrationId,
        workspaceId,
        provider: 'RESEND',
        name: 'Test 5',
        secretReference: 'sec-ref',
      },
    });

    await prisma.inboundReply.create({
      data: {
        id: inboundReplyId,
        workspaceId,
        provider: 'RESEND',
        providerEventId: 'evt-ambig',
        providerEmailId: 'email-ambig',
        status: 'UNCORRELATED',
        fromEmail: 'test@test.com',
        toEmail: 'me@me.com',
      },
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId },
      },
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-ambig',
      messageId: '<retrieved-msg-id-3>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: '<in-reply>',
      references: [],
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'AMBIGUOUS',
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({
      where: { id: inboundReplyId },
    });
    expect(updatedReply.status).toBe('AMBIGUOUS');
  });

  it('should defer execution when encountering the SENDING race condition, then succeed upon retry when SENT', async () => {
    const workspaceIdRace = randomUUID();
    const campaignContactIdRace = randomUUID();
    const integrationIdRace = randomUUID();
    const replyIdRace = randomUUID();
    const jobIdRace = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceIdRace, name: 'Test WS' },
    });

    // 1. Setup Company, Campaign, Person

    const companyId = randomUUID();
    const campaignId = randomUUID();
    const personId = randomUUID();

    await prisma.company.create({
      data: {
        id: companyId,
        workspaceId: workspaceIdRace,
        name: 'Acme',
        normalizedName: 'acme',
      },
    });
    await prisma.campaign.create({
      data: {
        id: campaignId,
        workspaceId: workspaceIdRace,
        companyId,
        name: 'Camp',
        normalizedName: 'camp',
        status: 'DRAFT',
        sendingIdentity: 'ME',
      },
    });
    await prisma.person.create({
      data: {
        id: personId,
        workspaceId: workspaceIdRace,
        companyId,
        personKind: 'PERSON',
        name: 'John Doe',
        email: 'user@example.com',
      },
    });
    const campaignMember = await prisma.campaignMember.create({
      data: {
        id: campaignContactIdRace,
        workspaceId: workspaceIdRace,
        campaignId,
        personId,
        status: 'SENDING', // Simulate the SENDING race state
        targetRole: 'test',
      },
    });

    const integration = await prisma.integration.create({
      data: {
        id: integrationIdRace,
        workspaceId: workspaceIdRace,
        provider: 'RESEND',
        status: 'ACTIVE',
        secretReference: 'sec-1',
        name: 'Resend',
      },
    });

    const inboundReply = await prisma.inboundReply.create({
      data: {
        id: replyIdRace,
        workspaceId: workspaceIdRace,
        provider: 'RESEND',
        providerEventId: 'evt-race',
        providerEmailId: 'resend-race',
        fromEmail: 'user@example.com',
        toEmail: 'me@example.com',
        status: 'UNCORRELATED',
      },
    });

    const job = await prisma.job.create({
      data: {
        id: jobIdRace,
        workspaceId: workspaceIdRace,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: {
          inboundReplyId: replyIdRace,
          integrationId: integrationIdRace,
        },
      },
    });

    // Setup mocks
    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValue({
      providerEmailId: 'resend-race',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: '<race@local>',
      references: ['<race@local>'],
    });

    correlationServiceMock.correlate.mockResolvedValue({
      status: 'CORRELATED',
      campaignMemberId: campaignContactIdRace,
    });

    // 2. Worker executes once
    // 10C updates InboundReply, 10D throws ContactStateTransitionException (isRetryable: true)
    // Job status should become PENDING (retryable failure)
    const claimed = await (worker as any).claimAndProcessJobs();
    expect(claimed).toBe(1);

    const jobAfterFirst = await prisma.job.findUnique({
      where: { id: jobIdRace },
    });
    expect(jobAfterFirst?.status).toBe('PENDING'); // Retryable!
    expect(jobAfterFirst?.attemptCount).toBe(1);

    const contactAfterFirst = await prisma.campaignMember.findUnique({
      where: { id: campaignContactIdRace },
    });
    expect(contactAfterFirst?.status).toBe('SENDING');

    const replyAfterFirst = await prisma.inboundReply.findUnique({
      where: { id: replyIdRace },
    });
    expect(replyAfterFirst?.status).toBe('CORRELATED');

    // 3. Simulate outbound dispatch finishing by changing contact status to SENT
    await prisma.campaignMember.update({
      where: { id: campaignContactIdRace },
      data: { status: 'SENT' },
    });

    // 4. Force job to be available immediately
    await prisma.job.update({
      where: { id: jobIdRace },
      data: { availableAt: new Date(Date.now() - 10000) },
    });

    // 5. Worker executes again (Retry)
    const claimed2 = await (worker as any).claimAndProcessJobs();
    expect(claimed2).toBe(1);

    const jobAfterSecond = await prisma.job.findUnique({
      where: { id: jobIdRace },
    });
    expect(jobAfterSecond?.status).toBe('COMPLETED'); // Success!

    // 6. Verify 10D transition occurred
    const contactAfterSecond = await prisma.campaignMember.findUnique({
      where: { id: campaignContactIdRace },
    });
    expect(contactAfterSecond?.status).toBe('REPLIED');
  });
});
