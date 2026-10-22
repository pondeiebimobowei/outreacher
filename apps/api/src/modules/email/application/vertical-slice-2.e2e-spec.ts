import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../app.module';
import { randomUUID } from 'crypto';
import { Webhook } from 'svix';
import { PrismaClient, CampaignMemberStatus } from '@repo/db';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../../../../test/helpers/db-test-harness';
import { ResendEmailProviderAdapter } from '../infrastructure/resend-email-provider.adapter';
import { ResendInboundContentAdapter } from '../infrastructure/resend-inbound-content.adapter';
import { EmailDispatchWorker } from './email-dispatch.worker';
import { InboundReplyWorker } from './inbound-reply.worker';

jest.unmock('@repo/db');
// We do NOT mock SVIX, we use real Svix library to generate a valid signature

describe('10H (BL-022): End-to-End Vertical Slice 2 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let cookieA: string;
  let integrationAId: string;
  let integrationBId: string;
  let campaignAId: string;
  let contactAId: string;
  let campaignContactAId: string;

  // Track the generated message IDs
  let mockProviderMessageId = '';
  let mockRfcMessageId = '';

  const mockOutboundAdapter = {
    provider: 'RESEND',
    sendEmail: jest.fn().mockImplementation(async (input) => {
      mockProviderMessageId = `mock-resend-id-${randomUUID()}`;
      mockRfcMessageId = `<rfc-${randomUUID()}@domain.com>`;
      return {
        providerMessageId: mockProviderMessageId,
        messageId: mockRfcMessageId,
      };
    })
  };

  const mockInboundContentAdapter = {
    getEmailDetails: jest.fn().mockImplementation(async (providerEmailId, credentials) => {
      return {
        providerEmailId,
        messageId: '<inbound-rfc-1234@domain.com>',
        inReplyTo: mockRfcMessageId, // Correctly tie back to the outbound RFC message ID
        references: [mockRfcMessageId],
        text: 'Hello, this is a reply.',
        html: '<p>Hello, this is a reply.</p>'
      };
    })
  };

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET_A = 'whsec_testsecretaaaaaaaaaaaaaaaa';
    process.env.WEBHOOK_SECRET_B = 'whsec_testsecretbbbbbbbbbbbbbbbb';
    prisma = await setupTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ResendEmailProviderAdapter)
      .useValue(mockOutboundAdapter)
      .overrideProvider(ResendInboundContentAdapter)
      .useValue(mockInboundContentAdapter)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await teardownTestDatabase();
  });

  it('proves the full Vertical Slice 2 integration loop', async () => {
    // 1. Authenticated Setup (Tenant A)
    const signupA = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        email: `usera-${randomUUID()}@example.com`,
        password: 'Password123!',
      })
      .expect((res) => { if (res.status !== 201) console.log(res.body); }).expect(201);
    
    workspaceAId = signupA.body.workspace.id;
    userAId = signupA.body.user.id;
    cookieA = (signupA.get('Set-Cookie') || []).find((c: string) => c.startsWith('career_os_session='))!;

    // Authenticated Setup (Tenant B - for isolation test)
    const signupB = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        email: `userb-${randomUUID()}@example.com`,
        password: 'Password123!',
      })
      .expect((res) => { if (res.status !== 201) console.log(res.body); }).expect(201);
    workspaceBId = signupB.body.workspace.id;

    // 2. Integration Setup
    const integrationA = await prisma.integration.create({
      data: {
        workspaceId: workspaceAId,
        provider: 'RESEND',
        name: 'Resend Testing',
        status: 'ACTIVE',
        secretReference: 'mock://resend',
        webhookSecretReference: 'env://WEBHOOK_SECRET_A',
      }
    });
    integrationAId = integrationA.id;
    
    const integrationB = await prisma.integration.create({
      data: {
        workspaceId: workspaceBId,
        provider: 'RESEND',
        name: 'Resend Testing B',
        status: 'ACTIVE',
        secretReference: 'mock://resend',
        webhookSecretReference: 'env://WEBHOOK_SECRET_B',
      }
    });
    integrationBId = integrationB.id;

    // AuthIdentity creations removed (secrets resolved via env://)

    const senderA = await prisma.senderAccount.create({
      data: {
        workspaceId: workspaceAId,
        integrationId: integrationAId,
        fromEmail: 'sender-a@example.com',
        fromName: 'Sender A',
        status: 'ACTIVE'
      }
    });

    // 3. Campaign & Person Setup
    const companyA = await prisma.company.create({ data: { workspaceId: workspaceAId, name: 'Test Company', normalizedName: 'test-company', domain: 'test.com' } });
    const companyAId = companyA.id;
    const campaignA = await prisma.campaign.create({
      data: {
        workspaceId: workspaceAId,
        companyId: companyAId,
        name: 'Test Campaign',
        normalizedName: 'test-campaign',
        status: 'ACTIVE',
      }
    });
    campaignAId = campaignA.id;

    await prisma.campaignSenderAccount.create({
      data: {
        workspaceId: workspaceAId,
        campaignId: campaignAId,
        senderAccountId: senderA.id
      }
    });

    const contactA = await prisma.person.create({
      data: {
        workspaceId: workspaceAId,
        companyId: companyAId,
        email: 'recipient-a@example.com',
        name: 'Recipient A',
      }
    });
    contactAId = contactA.id;

    const campaignContactA = await prisma.campaignMember.create({
      data: {
        workspaceId: workspaceAId,
        campaignId: campaignAId,
        personId: contactAId,
        status: 'READY',
        currentSubject: 'Hello',
        currentBody: '<p>Hello {{firstName}}</p>',
      }
    });
    campaignContactAId = campaignContactA.id;

    // 4. Real Dispatch Path (Enqueue & Process)
    const createdEmailSend = await prisma.emailSend.create({
      data: {
        workspaceId: workspaceAId,
        campaignId: campaignAId,
        campaignMemberId: campaignContactAId,
        type: 'INITIAL',
        subject: 'Hello',
        body: '<p>Hello {{firstName}}</p>',
        status: 'RESERVED',
        senderAccountId: senderA.id,
        provider: 'RESEND',
        replyToToken: 'test-reply-token'
      }
    });
    await prisma.job.create({
      data: {
        workspaceId: workspaceAId,
        type: 'EMAIL_DISPATCH',
        payload: { emailSendId: createdEmailSend.id, campaignMemberId: campaignContactAId },
        status: 'PENDING'
      }
    });

    // Fetch the real dispatch worker and run it
    const dispatchWorker = app.get(EmailDispatchWorker);
    const claimedJob = await dispatchWorker.claimNextJob();
    expect(claimedJob).toBeDefined();
    
    const dispatchResult = await dispatchWorker.processJob(claimedJob!);
    expect(dispatchResult).toBe(true);

    // 5 & 6. Verify EmailSend Persistence with ProviderMessageId
    const emailSend = await prisma.emailSend.findFirst({
      where: { campaignMemberId: campaignContactAId }
    });
    expect(emailSend).toBeDefined();
    expect(emailSend!.providerMessageId).toBe(mockProviderMessageId);
    expect(emailSend!.messageId).toBe(mockRfcMessageId);

    const ccAfterDispatch = await prisma.campaignMember.findUnique({
      where: { id: campaignContactAId }
    });
    expect(ccAfterDispatch!.status).toBe(CampaignMemberStatus.SENT);

    // Enqueue a pending follow-up job to be cancelled
    const followupJob = await prisma.job.create({
      data: {
        workspaceId: workspaceAId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        payload: { campaignMemberId: campaignContactAId },
        status: 'PENDING'
      }
    });

    const unrelatedFollowupJob = await prisma.job.create({
      data: {
        workspaceId: workspaceAId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        payload: { campaignMemberId: 'other-cc-id' },
        status: 'PENDING'
      }
    });

    // 7 & 8. Deterministic Inbound Webhook (with Signature Validation)
    const inboundPayload = {
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: `resend-email-${randomUUID()}`,
        message_id: '<inbound-rfc-1234@domain.com>',
        from: 'recipient-a@example.com',
        to: 'sender-a@example.com',
        subject: 'Re: Hello',
      }
    };
    const svixEventId = `msg_${randomUUID()}`;
    const payloadString = JSON.stringify(inboundPayload);
    
    // We will send to Integration B first for isolation check.

    // 14. Tenant Isolation Check: Send same payload to Integration B first
    const whB = new Webhook('whsec_testsecretbbbbbbbbbbbbbbbb');
    const nowB = new Date();
    const signatureB = whB.sign(svixEventId, nowB, payloadString);
    const signatureHeadersB = {
      'svix-id': svixEventId,
      'svix-timestamp': Math.floor(nowB.getTime() / 1000).toString(),
      'svix-signature': signatureB
    };

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integrationBId}`)
      .set('svix-id', signatureHeadersB['svix-id'])
      .set('svix-timestamp', signatureHeadersB['svix-timestamp'])
      .set('svix-signature', signatureHeadersB['svix-signature'])
      .send(inboundPayload)
      .expect((res) => { if (res.status !== 202) console.log(res.body); }).expect(202); 

    const inboundReplyWorker = app.get(InboundReplyWorker);
    await (inboundReplyWorker as any).claimAndProcessJobs();

    // Verify Workspace B failed to correlate and Workspace A is unaffected
    const inboundRepliesB = await prisma.inboundReply.findMany({
      where: { providerEventId: svixEventId, workspaceId: workspaceBId }
    });
    expect(inboundRepliesB).toHaveLength(1);
    expect(inboundRepliesB[0].status).toBe('UNCORRELATED');

    const ccUnchanged = await prisma.campaignMember.findUnique({
      where: { id: campaignContactAId }
    });
    expect(ccUnchanged!.status).toBe(CampaignMemberStatus.SENT); // Still SENT

    // 9 & 10. Correlation & Persistence (Now send to Integration A)
    const whA = new Webhook('whsec_testsecretaaaaaaaaaaaaaaaa');
    const nowA = new Date();
    const signatureA = whA.sign(svixEventId, nowA, payloadString);
    const signatureHeadersA = {
      'svix-id': svixEventId,
      'svix-timestamp': Math.floor(nowA.getTime() / 1000).toString(),
      'svix-signature': signatureA
    };

    await request(app.getHttpServer())
      .post(`/api/v1/webhooks/email/inbound/${integrationAId}`)
      .set('svix-id', signatureHeadersA['svix-id'])
      .set('svix-timestamp', signatureHeadersA['svix-timestamp'])
      .set('svix-signature', signatureHeadersA['svix-signature'])
      .send(inboundPayload)
      .expect((res) => { if (res.status !== 202) console.log(res.body); }).expect(202);

    await (inboundReplyWorker as any).claimAndProcessJobs();

    const inboundReplies = await prisma.inboundReply.findMany({
      where: { providerEventId: svixEventId, workspaceId: workspaceAId }
    });
    expect(inboundReplies).toHaveLength(1);
    expect(inboundReplies[0].status).toBe('CORRELATED');

    // 11. State Machine (Reply)
    const ccAfterReply = await prisma.campaignMember.findUnique({
      where: { id: campaignContactAId }
    });
    expect(ccAfterReply!.status).toBe(CampaignMemberStatus.REPLIED);

    // 12. Matching Follow-up Cancellation
    const cancelledJob = await prisma.job.findUnique({ where: { id: followupJob.id }});
    expect(cancelledJob!.status).toBe('COMPLETED'); // Cancelled jobs are marked COMPLETED (or CANCELLED depending on implementation, usually completed to stop retry)
    // Wait, let's verify what status it uses for cancellation. The actual code sets it to COMPLETED.

    // 13. Unrelated follow-up preservation
    const preservedJob = await prisma.job.findUnique({ where: { id: unrelatedFollowupJob.id }});
    expect(preservedJob!.status).toBe('PENDING');

    // 15. Authenticated POST /outcome
    const outcomeRes = await request(app.getHttpServer())
      .post(`/api/v1/campaign-contacts/${campaignContactAId}/outcome`)
      .set('Cookie', cookieA)
      .set('x-workspace-id', workspaceAId)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        outcomeType: 'QUALIFIED_CONVERSATION',
        notes: 'Great chat'
      })
      .expect((res) => { if (res.status !== 201) console.log(res.body); }).expect(201);
    
    // 16. User Context Constraint
    const outcomeId = outcomeRes.body.id;
    const outcome = await prisma.outcome.findUnique({ where: { id: outcomeId } });
    expect(outcome).toBeDefined();
    expect(outcome!.recordedByUserId).toBe(userAId);
    expect(outcome!.type).toBe('QUALIFIED_CONVERSATION');

    // 17. State Machine (Complete)
    const ccAfterOutcome = await prisma.campaignMember.findUnique({
      where: { id: campaignContactAId }
    });
    expect(ccAfterOutcome!.status).toBe(CampaignMemberStatus.COMPLETED);
  });
});
