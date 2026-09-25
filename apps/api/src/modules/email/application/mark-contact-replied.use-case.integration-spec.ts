import { randomUUID } from 'crypto';
import { PrismaClient } from '@repo/db';
import {
  setupTestDatabase,
  teardownTestDatabase,
} from '../../../../test/helpers/db-test-harness';
import {
  MarkContactRepliedUseCase,
  ContactStateTransitionException,
} from './mark-contact-replied.use-case';

// MarkContactRepliedUseCase is a plain injectable — instantiate directly
// with the real Prisma client wired to TEST_DATABASE_URL.

async function buildScenario(
  prisma: PrismaClient,
  contactStatus: string,
  workspaceId?: string,
) {
  const wsId = workspaceId ?? randomUUID();

  await prisma.workspace.create({ data: { id: wsId, name: 'Test WS' } });
  const company = await prisma.company.create({
    data: {
      id: randomUUID(),
      workspaceId: wsId,
      name: 'Acme',
      normalizedName: 'acme',
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      id: randomUUID(),
      workspaceId: wsId,
      companyId: company.id,
      name: 'Camp',
      normalizedName: 'camp',
      status: 'DRAFT',
      sendingIdentity: 'ME',
    },
  });
  const contact = await prisma.person.create({
    data: {
      id: randomUUID(),
      workspaceId: wsId,
      companyId: company.id,
      personKind: 'PERSON',
      name: 'Jane Doe',
    },
  });
  const campaignMemberId = randomUUID();
  await prisma.campaignMember.create({
    data: {
      id: campaignMemberId,
      workspaceId: wsId,
      campaignId: campaign.id,
      personId: contact.id,
      status: contactStatus,
      targetRole: 'Eng',
    },
  });

  return { workspaceId: wsId, campaignMemberId };
}

async function createFollowUpJob(
  prisma: PrismaClient,
  workspaceId: string,
  campaignMemberId: string,
  status: string,
) {
  const id = randomUUID();
  await prisma.job.create({
    data: {
      id,
      workspaceId,
      type: 'SCHEDULED_FOLLOW_UP_CHECK',
      status: status as any,
      payload: { campaignMemberId },
    },
  });
  return id;
}

describe('MarkContactRepliedUseCase – PostgreSQL cancellation matrix', () => {
  let prisma: PrismaClient;
  let useCase: MarkContactRepliedUseCase;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
    // Construct with the real Prisma client bound as PrismaService
    useCase = new MarkContactRepliedUseCase(prisma as any);
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
    await prisma.workspace.deleteMany();
  });

  // ─── State transition paths ─────────────────────────────────────────────

  it('SENT → REPLIED: matching PENDING follow-up becomes COMPLETED', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const contact = await prisma.campaignMember.findUniqueOrThrow({
      where: { id: campaignMemberId },
    });
    expect(contact.status).toBe('REPLIED');

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMPLETED');
    expect(job.lastError).toBe('Cancelled due to inbound reply');
  });

  it('FOLLOW_UP_DUE → REPLIED: matching PENDING follow-up becomes COMPLETED', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'FOLLOW_UP_DUE',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const contact = await prisma.campaignMember.findUniqueOrThrow({
      where: { id: campaignMemberId },
    });
    expect(contact.status).toBe('REPLIED');

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMPLETED');
  });

  // ─── Idempotent path ────────────────────────────────────────────────────

  it('already REPLIED + PENDING follow-up: follow-up still becomes COMPLETED (idempotent cleanup)', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'REPLIED',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMPLETED');
  });

  // ─── Multiple pending jobs ───────────────────────────────────────────────

  it('multiple PENDING follow-ups: all are cancelled', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const jobId1 = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );
    const jobId2 = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );
    const jobId3 = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    for (const id of [jobId1, jobId2, jobId3]) {
      const job = await prisma.job.findUniqueOrThrow({ where: { id } });
      expect(job.status).toBe('COMPLETED');
    }
  });

  // ─── Historical jobs are preserved ──────────────────────────────────────

  it('RUNNING follow-up remains RUNNING', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'RUNNING',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('RUNNING');
  });

  it('COMPLETED follow-up remains COMPLETED', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'COMPLETED',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMPLETED');
    expect(job.lastError).toBeNull(); // unmodified – no cancellation annotation
  });

  it('DEAD_LETTER follow-up remains DEAD_LETTER', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const jobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'DEAD_LETTER',
    );

    await useCase.execute(campaignMemberId, workspaceId);

    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('DEAD_LETTER');
  });

  // ─── Tenant isolation ───────────────────────────────────────────────────

  it('other-workspace PENDING follow-up is untouched', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );

    // Build a second workspace with its own contact that happens to share
    // the same campaignMemberId string in the payload — the workspace_id
    // predicate must prevent cancellation.
    const otherWsId = randomUUID();
    await prisma.workspace.create({
      data: { id: otherWsId, name: 'Other WS' },
    });
    const otherJobId = randomUUID();
    await prisma.job.create({
      data: {
        id: otherJobId,
        workspaceId: otherWsId,
        type: 'SCHEDULED_FOLLOW_UP_CHECK',
        status: 'PENDING',
        payload: { campaignMemberId }, // same contact id, different workspace
      },
    });

    await useCase.execute(campaignMemberId, workspaceId);

    const otherJob = await prisma.job.findUniqueOrThrow({
      where: { id: otherJobId },
    });
    expect(otherJob.status).toBe('PENDING');
  });

  // ─── Unrelated job types ────────────────────────────────────────────────

  it('PENDING EMAIL_DISPATCH job for the same contact is untouched', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const emailJobId = randomUUID();
    await prisma.job.create({
      data: {
        id: emailJobId,
        workspaceId,
        type: 'EMAIL_DISPATCH',
        status: 'PENDING',
        payload: { campaignMemberId },
      },
    });

    await useCase.execute(campaignMemberId, workspaceId);

    const emailJob = await prisma.job.findUniqueOrThrow({
      where: { id: emailJobId },
    });
    expect(emailJob.status).toBe('PENDING');
  });

  // ─── Atomic rollback ────────────────────────────────────────────────────

  it('transaction failure rolls back both CampaignMember and Job changes', async () => {
    const { workspaceId, campaignMemberId } = await buildScenario(
      prisma,
      'SENT',
    );
    const followUpJobId = await createFollowUpJob(
      prisma,
      workspaceId,
      campaignMemberId,
      'PENDING',
    );

    // Throw inside the transaction after the cancellation query executes
    // but before $transaction commits, by hijacking the logger message.
    const loggerSpy = jest
      .spyOn((useCase as any).logger, 'log')
      .mockImplementation((msg: string) => {
        if (typeof msg === 'string' && msg.includes('Cancelled')) {
          throw new Error('Simulated pre-commit failure');
        }
      });

    await expect(
      useCase.execute(campaignMemberId, workspaceId),
    ).rejects.toThrow('Simulated pre-commit failure');

    loggerSpy.mockRestore();

    // Both rows must have reverted
    const contact = await prisma.campaignMember.findUniqueOrThrow({
      where: { id: campaignMemberId },
    });
    expect(contact.status).toBe('SENT');

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: followUpJobId },
    });
    expect(job.status).toBe('PENDING');
  });
});
