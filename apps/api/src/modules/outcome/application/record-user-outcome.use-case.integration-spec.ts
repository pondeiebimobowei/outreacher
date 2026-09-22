import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, OutcomeType } from '@repo/db';
import { randomUUID } from 'crypto';
import { RecordUserOutcomeUseCase } from './record-user-outcome.use-case';
import { cleanTestDatabase, getTestPrismaClient, setupTestDatabase, teardownTestDatabase } from '../../../../test/helpers/db-test-harness';

describe('RecordUserOutcomeUseCase Integration', () => {
  let prisma: PrismaClient;
  let useCase: RecordUserOutcomeUseCase;

  beforeAll(async () => {
    await setupTestDatabase();
    prisma = getTestPrismaClient();
    useCase = new RecordUserOutcomeUseCase(prisma as any);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  async function seedContact(status: string) {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const companyId = randomUUID();
    const campaignId = randomUUID();
    const contactId = randomUUID();
    const campaignContactId = randomUUID();

    await prisma.workspace.create({ data: { id: workspaceId, name: 'Outcome WS' } });
    await prisma.user.create({ data: { id: userId, email: `test-${userId}@test.com`, name: 'User' } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: 'OWNER' } });
    await prisma.company.create({ data: { id: companyId, workspaceId, name: 'Outcome Co', normalizedName: 'oc' } });
    await prisma.campaign.create({ data: { id: campaignId, workspaceId, companyId, name: 'Outcome Camp', normalizedName: 'occamp', status: 'DRAFT', sendingIdentity: 'ME' } });
    await prisma.contact.create({ data: { id: contactId, workspaceId, companyId, contactKind: 'PERSON', name: 'John', email: `${contactId}@test.com` } });
    
    await prisma.campaignContact.create({
      data: {
        id: campaignContactId,
        workspaceId,
        campaignId,
        contactId,
        status: status as any,
        targetRole: 'test',
      },
    });

    return { workspaceId, userId, campaignContactId };
  }

  it('records an outcome and transitions to COMPLETED when contact is REPLIED', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('REPLIED');

    const outcomeId = await useCase.execute(campaignContactId, workspaceId, userId, OutcomeType.QUALIFIED_CONVERSATION, 'Look at this note');

    const updatedContact = await prisma.campaignContact.findUniqueOrThrow({ where: { id: campaignContactId } });
    expect(updatedContact.status).toBe('COMPLETED');

    const outcome = await prisma.outcome.findUniqueOrThrow({ where: { id: outcomeId } });
    expect(outcome.campaignContactId).toBe(campaignContactId);
    expect(outcome.workspaceId).toBe(workspaceId);
    expect(outcome.recordedByUserId).toBe(userId);
    expect(outcome.type).toBe('QUALIFIED_CONVERSATION');
    expect(outcome.notes).toBe('Look at this note');
  });

  it('handles absent notes (null)', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('REPLIED');

    const outcomeId = await useCase.execute(campaignContactId, workspaceId, userId, OutcomeType.NOT_INTERESTED);

    const outcome = await prisma.outcome.findUniqueOrThrow({ where: { id: outcomeId } });
    expect(outcome.notes).toBeNull();
  });

  it('rejects PENDING, SENT, and COMPLETED states with 409 Conflict', async () => {
    const s1 = await seedContact('PENDING');
    await expect(useCase.execute(s1.campaignContactId, s1.workspaceId, s1.userId, OutcomeType.REFERRAL)).rejects.toThrow(ConflictException);

    const s2 = await seedContact('SENT');
    await expect(useCase.execute(s2.campaignContactId, s2.workspaceId, s2.userId, OutcomeType.REFERRAL)).rejects.toThrow(ConflictException);

    const s3 = await seedContact('COMPLETED');
    await expect(useCase.execute(s3.campaignContactId, s3.workspaceId, s3.userId, OutcomeType.REFERRAL)).rejects.toThrow(ConflictException);
  });

  it('rejects cross-workspace access with 404 NotFound', async () => {
    const { campaignContactId, userId } = await seedContact('REPLIED');
    const wrongWorkspaceId = randomUUID();

    await expect(useCase.execute(campaignContactId, wrongWorkspaceId, userId, OutcomeType.QUALIFIED_CONVERSATION)).rejects.toThrow(NotFoundException);
  });

  it('rolls back completely if a failure occurs after the Outcome insert', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('REPLIED');

    // To simulate a real DB-level constraint failure after the insert, we'll intentionally 
    // violate a database constraint on the subsequent campaignContact update.
    // However, Prisma doesn't let us easily insert bad data due to types.
    // Instead, we will alter the table to reject the 'COMPLETED' status temporarily for this test,
    // which guarantees a real PostgreSQL transaction failure.
    
    await prisma.$executeRaw`ALTER TABLE campaign_contacts ADD CONSTRAINT check_no_completed CHECK (status != 'COMPLETED')`;

    try {
      await expect(
        useCase.execute(campaignContactId, workspaceId, userId, OutcomeType.QUALIFIED_CONVERSATION, 'Should not persist')
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRaw`ALTER TABLE campaign_contacts DROP CONSTRAINT check_no_completed`;
    }

    // The contact should remain REPLIED
    const contact = await prisma.campaignContact.findUniqueOrThrow({ where: { id: campaignContactId } });
    expect(contact.status).toBe('REPLIED');

    // NO outcome should exist for this contact
    const outcomes = await prisma.outcome.findMany({ where: { campaignContactId } });
    expect(outcomes).toHaveLength(0);
  });

  it('serializes concurrent outcome attempts and rejects duplicates with 409 Conflict', async () => {
    const { workspaceId, userId, campaignContactId } = await seedContact('REPLIED');

    // Fire two identical outcome requests simultaneously
    const results = await Promise.allSettled([
      useCase.execute(campaignContactId, workspaceId, userId, OutcomeType.QUALIFIED_CONVERSATION, 'Attempt A'),
      useCase.execute(campaignContactId, workspaceId, userId, OutcomeType.QUALIFIED_CONVERSATION, 'Attempt B'),
    ]);

    // One should succeed, one should fail with ConflictException
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    }

    // Verify exactly one outcome exists in DB
    const outcomes = await prisma.outcome.findMany({ where: { campaignContactId } });
    expect(outcomes).toHaveLength(1);

    // Verify contact status is COMPLETED
    const contact = await prisma.campaignContact.findUniqueOrThrow({ where: { id: campaignContactId } });
    expect(contact.status).toBe('COMPLETED');
  });
});
