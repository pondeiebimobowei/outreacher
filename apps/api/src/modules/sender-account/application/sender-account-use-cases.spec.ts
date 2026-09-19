import { CreateSenderAccountUseCase } from './create-sender-account.use-case';
import { UpdateSenderAccountUseCase } from './update-sender-account.use-case';
import { AssignCampaignSendersUseCase } from '../../campaign-sender/application/assign-campaign-senders.use-case';
import {
  AppNotFoundException,
  AppValidationException,
  AppConflictException,
} from '../../../common/errors/application.exception';
import { SenderStatus, AssignmentStatus } from '@repo/db';

// ─── mock factories ────────────────────────────────────────────────────────

const makeTxClient = (overrides: any = {}) => ({
  campaignSenderAccount: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...overrides.campaignSenderAccount,
  },
});

const makePrisma = (overrides: any = {}) => {
  let txClient = makeTxClient(overrides);
  return {
    integration: { findUnique: jest.fn(), ...overrides.integration },
    senderAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      ...overrides.senderAccount,
    },
    campaign: { findUnique: jest.fn(), ...overrides.campaign },
    campaignSenderAccount: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.campaignSenderAccount,
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txClient)),
    _txClient: txClient,
    ...overrides.extra,
  } as any;
};

const fakeSender = (overrides: any = {}) => ({
  id: 'sender-1',
  workspaceId: 'ws-1',
  integrationId: 'integ-1',
  fromName: 'Sender',
  fromEmail: 'sender@example.com',
  replyTo: null,
  dailyLimit: 50,
  status: SenderStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const fakeInteg = (overrides: any = {}) => ({
  id: 'integ-1',
  workspaceId: 'ws-1',
  ...overrides,
});

const fakeCampaign = (overrides: any = {}) => ({
  id: 'camp-1',
  workspaceId: 'ws-1',
  ...overrides,
});

// ─── CreateSenderAccountUseCase ────────────────────────────────────────────

describe('CreateSenderAccountUseCase', () => {
  it('canonicalizes fromEmail: trims whitespace and lowercases', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender({ fromEmail: 'alex@company.com' })),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', {
      integrationId: 'integ-1',
      fromName: 'Alex',
      fromEmail: '  Alex@Company.COM  ',
    });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromEmail: 'alex@company.com' }) }),
    );
  });

  it('canonicalizes replyTo: trims whitespace and lowercases', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender({ replyTo: 'reply@company.com' })),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', {
      integrationId: 'integ-1',
      fromName: 'Test',
      fromEmail: 'sender@test.com',
      replyTo: '  Reply@Company.COM  ',
    });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replyTo: 'reply@company.com' }) }),
    );
  });

  it('rejects canonical duplicate fromEmail (Alex@Company.COM vs alex@company.com)', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        // canonical duplicate already exists
        findFirst: jest.fn().mockResolvedValue(fakeSender({ fromEmail: 'alex@company.com' })),
        create: jest.fn(),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await expect(
      uc.execute('ws-1', { integrationId: 'integ-1', fromName: 'B', fromEmail: 'Alex@Company.COM' }),
    ).rejects.toThrow(AppConflictException);
    expect(prisma.senderAccount.create).not.toHaveBeenCalled();
  });

  it('accepts dailyLimit = 1', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender({ dailyLimit: 1 })),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', { integrationId: 'integ-1', fromName: 'T', fromEmail: 'a@a.com', dailyLimit: 1 });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dailyLimit: 1 }) }),
    );
  });

  it('accepts dailyLimit = 200', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender({ dailyLimit: 200 })),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', { integrationId: 'integ-1', fromName: 'T', fromEmail: 'b@b.com', dailyLimit: 200 });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dailyLimit: 200 }) }),
    );
  });

  it('rejects integration from a different workspace', async () => {
    const prisma = makePrisma({
      // integration.findUnique scoped by workspaceId returns null → not found in this workspace
      integration: { findUnique: jest.fn().mockResolvedValue(null) },
      senderAccount: { create: jest.fn() },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await expect(
      uc.execute('ws-2', { integrationId: 'integ-belongs-to-ws1', fromName: 'T', fromEmail: 'x@x.com' }),
    ).rejects.toThrow(AppValidationException);
    expect(prisma.senderAccount.create).not.toHaveBeenCalled();
  });

  it('new sender starts with ACTIVE status', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg()) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender({ status: SenderStatus.ACTIVE })),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', { integrationId: 'integ-1', fromName: 'T', fromEmail: 'new@test.com' });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: SenderStatus.ACTIVE }) }),
    );
  });

  it('integrationId is passed through to create', async () => {
    const prisma = makePrisma({
      integration: { findUnique: jest.fn().mockResolvedValue(fakeInteg({ id: 'integ-xyz' })) },
      senderAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fakeSender()),
      },
    });
    const uc = new CreateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', { integrationId: 'integ-xyz', fromName: 'T', fromEmail: 'z@test.com' });
    expect(prisma.senderAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ integrationId: 'integ-xyz' }) }),
    );
  });
});

// ─── UpdateSenderAccountUseCase ────────────────────────────────────────────

describe('UpdateSenderAccountUseCase', () => {
  it('canonicalizes fromEmail on update', async () => {
    const existing = fakeSender({ fromEmail: 'old@test.com' });
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(null), // no duplicate
        update: jest.fn().mockResolvedValue({ ...existing, fromEmail: 'new@company.com' }),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', 'sender-1', { fromEmail: '  NEW@Company.COM  ' });
    expect(prisma.senderAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromEmail: 'new@company.com' }) }),
    );
  });

  it('canonicalizes replyTo on update', async () => {
    const existing = fakeSender();
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ ...existing, replyTo: 'reply@company.com' }),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', 'sender-1', { replyTo: '  REPLY@Company.COM  ' });
    expect(prisma.senderAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replyTo: 'reply@company.com' }) }),
    );
  });

  it('rejects canonical duplicate fromEmail from a different sender', async () => {
    const existing = fakeSender({ fromEmail: 'original@test.com' });
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(existing),
        // another sender already has the canonical email
        findFirst: jest.fn().mockResolvedValue(fakeSender({ id: 'sender-2', fromEmail: 'taken@test.com' })),
        update: jest.fn(),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    await expect(
      uc.execute('ws-1', 'sender-1', { fromEmail: 'Taken@Test.COM' }),
    ).rejects.toThrow(AppConflictException);
    expect(prisma.senderAccount.update).not.toHaveBeenCalled();
  });

  it('cross-workspace update is rejected', async () => {
    // findUnique returns a sender that belongs to a different workspace
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(fakeSender({ workspaceId: 'ws-other' })),
        update: jest.fn(),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    await expect(
      uc.execute('ws-1', 'sender-1', { fromName: 'Attacker' }),
    ).rejects.toThrow(AppNotFoundException);
    expect(prisma.senderAccount.update).not.toHaveBeenCalled();
  });

  it('UpdateSenderAccountDto has no integrationId field — update data does not include integrationId', async () => {
    const existing = fakeSender();
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(existing),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    await uc.execute('ws-1', 'sender-1', { fromName: 'Changed' });
    const callData = prisma.senderAccount.update.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty('integrationId');
  });

  it('status not in dto → update does not include status field', async () => {
    const existing = fakeSender({ status: SenderStatus.ACTIVE });
    const prisma = makePrisma({
      senderAccount: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(existing),
      },
    });
    const uc = new UpdateSenderAccountUseCase(prisma);
    // dto has no status field
    await uc.execute('ws-1', 'sender-1', { fromName: 'Updated' });
    const callData = prisma.senderAccount.update.mock.calls[0][0].data;
    // status should be undefined (not explicitly set)
    expect(callData.status).toBeUndefined();
  });
});

// ─── AssignCampaignSendersUseCase ──────────────────────────────────────────

describe('AssignCampaignSendersUseCase', () => {
  it('throws AppNotFoundException when campaign not found', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await expect(
      uc.execute('ws-1', 'missing-campaign', { senderAccountIds: [] }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('rejects when any sender ID does not exist in workspace', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        // only 1 found, but 2 requested
        findMany: jest.fn().mockResolvedValue([fakeSender({ id: 'sender-1' })]),
      },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await expect(
      uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-1', 'sender-missing'] }),
    ).rejects.toThrow(AppValidationException);
  });

  it('partial write prevention: $transaction NOT called when validation fails', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([]), // none found
      },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await expect(
      uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-fake'] }),
    ).rejects.toThrow(AppValidationException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('empty senderAccountIds: $transaction called; updateMany removes all active', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await uc.execute('ws-1', 'camp-1', { senderAccountIds: [] });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('duplicate sender IDs are deduplicated before validation', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([
          fakeSender({ id: 'sender-a' }),
          fakeSender({ id: 'sender-b' }),
        ]),
      },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-a', 'sender-a', 'sender-b'] });
    // findMany should be called with deduplicated IDs
    const calledWith = prisma.senderAccount.findMany.mock.calls[0][0];
    const requestedIds: string[] = calledWith.where.id.in;
    // no duplicates
    expect(new Set(requestedIds).size).toBe(requestedIds.length);
    expect(requestedIds.length).toBe(2);
  });

  it('successful assignment: $transaction is called', async () => {
    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([fakeSender({ id: 'sender-1' })]),
      },
    });
    const uc = new AssignCampaignSendersUseCase(prisma);
    await uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-1'] });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('reactivation: if existing record found in tx, update to ACTIVE is called', async () => {
    const existingRemoved = { id: 'assignment-1', status: AssignmentStatus.REMOVED };
    const txUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const txFindFirst = jest.fn().mockResolvedValue(existingRemoved);
    const txUpdate = jest.fn().mockResolvedValue({});
    const txCreate = jest.fn();

    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([fakeSender({ id: 'sender-1' })]),
      },
      extra: {
        $transaction: jest.fn().mockImplementation(async (fn: any) =>
          fn({
            campaignSenderAccount: {
              updateMany: txUpdateMany,
              findFirst: txFindFirst,
              update: txUpdate,
              create: txCreate,
            },
          }),
        ),
      },
    });

    const uc = new AssignCampaignSendersUseCase(prisma);
    await uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-1'] });

    expect(txFindFirst).toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: AssignmentStatus.ACTIVE } }),
    );
    expect(txCreate).not.toHaveBeenCalled();
  });

  it('idempotent: if existing record is already ACTIVE, update is NOT called again', async () => {
    const existingActive = { id: 'assignment-1', status: AssignmentStatus.ACTIVE };
    const txUpdate = jest.fn();
    const txCreate = jest.fn();

    const prisma = makePrisma({
      campaign: { findUnique: jest.fn().mockResolvedValue(fakeCampaign()) },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([fakeSender({ id: 'sender-1' })]),
      },
      extra: {
        $transaction: jest.fn().mockImplementation(async (fn: any) =>
          fn({
            campaignSenderAccount: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              findFirst: jest.fn().mockResolvedValue(existingActive),
              update: txUpdate,
              create: txCreate,
            },
          }),
        ),
      },
    });

    const uc = new AssignCampaignSendersUseCase(prisma);
    await uc.execute('ws-1', 'camp-1', { senderAccountIds: ['sender-1'] });

    // Already ACTIVE — neither update nor create should be called
    expect(txUpdate).not.toHaveBeenCalled();
    expect(txCreate).not.toHaveBeenCalled();
  });
});
