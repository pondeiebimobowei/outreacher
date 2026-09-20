import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { InboundReplyWorker } from './inbound-reply.worker';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';
import { ReplyCorrelationService } from '../domain/reply-correlation.service';
import { InboundRetrievalErrorCode, InboundRetrievalException } from '../infrastructure/resend-inbound-content.adapter';
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

  beforeAll(async () => {
    prisma = await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });


  beforeEach(async () => {
    await prisma.job.deleteMany();
    await prisma.campaignContact.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.company.deleteMany();
    await prisma.inboundReply.deleteMany();
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

    const prismaServiceMock = {
      $transaction: prisma.$transaction.bind(prisma),
      $queryRaw: prisma.$queryRaw.bind(prisma),
      job: prisma.job,
      inboundReply: prisma.inboundReply,
      integration: prisma.integration,
      workspace: prisma.workspace,
      campaignContact: prisma.campaignContact,
      campaign: prisma.campaign,
      contact: prisma.contact
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboundReplyWorker,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN, useValue: adapterRegistryMock },
        { provide: SECRET_RESOLVER_TOKEN, useValue: secretResolverMock },
        { provide: ReplyCorrelationService, useValue: correlationServiceMock },
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
      data: { id: workspaceId, name: 'Test Workspace' }
    });

    await prisma.integration.create({
      data: { id: integrationId, workspaceId, provider: 'RESEND', name: 'Test', secretReference: 'sec-ref' }
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
        toEmail: 'me@me.com'
      }
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId }
      }
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockRejectedValueOnce(
      new InboundRetrievalException('Temp error', 'PROVIDER_ERROR', true)
    );

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    
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
      data: { id: workspaceId, name: 'Test Workspace 2' }
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
        leaseVersion: 1
      }
    });
    
    (worker as any).isRunning = true;
    await worker.recoverStaleJobs();
    (worker as any).isRunning = false;

    const recoveredJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    
    expect(recoveredJob.status).toBe('PENDING');
    expect(recoveredJob.leaseVersion).toBe(2);
  });

  it('should process job and save retrieved data when CORRELATED', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();
    const campaignContactId = randomUUID();
    const campaignId = randomUUID();
    const contactId = randomUUID();
    const companyId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 3' }
    });

    await prisma.integration.create({
      data: { id: integrationId, workspaceId, provider: 'RESEND', name: 'Test 3', secretReference: 'sec-ref' }
    });
    

    await prisma.company.create({
      data: { id: companyId, workspaceId, name: 'Comp', normalizedName: 'comp' }
    });
    await prisma.campaign.create({

      data: { id: campaignId, workspaceId, companyId, name: 'Camp', normalizedName: 'camp', status: 'DRAFT', sendingIdentity: 'ME' }
    });
    await prisma.contact.create({
      data: { id: contactId, workspaceId, companyId, contactKind: 'PERSON', name: 'John Doe' }
    });
    await prisma.campaignContact.create({
      data: { id: campaignContactId, workspaceId, campaignId, contactId, targetRole: 'test', status: 'PENDING' }
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
        toEmail: 'me@me.com'
      }
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId }
      }
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-corr',
      messageId: '<retrieved-msg-id>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: '<in-reply>',
      references: ['<in-reply>']
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'CORRELATED',
      campaignContactId
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({ where: { id: inboundReplyId } });
    expect(updatedReply.status).toBe('CORRELATED');
    expect(updatedReply.campaignContactId).toBe(campaignContactId);
    expect(updatedReply.bodyText).toBe('hello');
    expect(updatedReply.messageId).toBe('<retrieved-msg-id>');
  });

  it('should process job and set status to UNCORRELATED', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 4' }
    });

    await prisma.integration.create({
      data: { id: integrationId, workspaceId, provider: 'RESEND', name: 'Test 4', secretReference: 'sec-ref' }
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
        toEmail: 'me@me.com'
      }
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId }
      }
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-uncorr',
      messageId: '<retrieved-msg-id-2>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: null,
      references: []
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'UNCORRELATED'
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({ where: { id: inboundReplyId } });
    expect(updatedReply.status).toBe('UNCORRELATED');
  });

  it('should process job and set status to AMBIGUOUS', async () => {
    const workspaceId = randomUUID();
    const integrationId = randomUUID();
    const inboundReplyId = randomUUID();
    const jobId = randomUUID();

    await prisma.workspace.create({
      data: { id: workspaceId, name: 'Test Workspace 5' }
    });

    await prisma.integration.create({
      data: { id: integrationId, workspaceId, provider: 'RESEND', name: 'Test 5', secretReference: 'sec-ref' }
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
        toEmail: 'me@me.com'
      }
    });

    await prisma.job.create({
      data: {
        id: jobId,
        workspaceId,
        type: 'WEBHOOK_PROCESSING',
        status: 'PENDING',
        payload: { inboundReplyId, integrationId }
      }
    });

    adapterRegistryMock.getAdapter().getEmailDetails.mockResolvedValueOnce({
      providerEmailId: 'email-ambig',
      messageId: '<retrieved-msg-id-3>',
      text: 'hello',
      html: '<p>hello</p>',
      inReplyTo: '<in-reply>',
      references: []
    });

    correlationServiceMock.correlate.mockResolvedValueOnce({
      status: 'AMBIGUOUS'
    });

    const processed = await (worker as any).claimAndProcessJobs();
    expect(processed).toBe(1);

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(updatedJob.status).toBe('COMPLETED');

    const updatedReply = await prisma.inboundReply.findUniqueOrThrow({ where: { id: inboundReplyId } });
    expect(updatedReply.status).toBe('AMBIGUOUS');
  });
});
