jest.unmock('@repo/db');

import { PrismaService } from '../../src/database/prisma.service';
import { CreateIntegrationUseCase } from '../../src/modules/integration/application/create-integration.use-case';
import { GetIntegrationUseCase } from '../../src/modules/integration/application/get-integration.use-case';
import { ListIntegrationsUseCase } from '../../src/modules/integration/application/list-integrations.use-case';
import { DisableIntegrationUseCase } from '../../src/modules/integration/application/disable-integration.use-case';
import { CreateSenderAccountUseCase } from '../../src/modules/sender-account/application/create-sender-account.use-case';
import { UpdateSenderAccountUseCase } from '../../src/modules/sender-account/application/update-sender-account.use-case';
import { ListSenderAccountsUseCase } from '../../src/modules/sender-account/application/list-sender-accounts.use-case';
import { AssignCampaignSendersUseCase } from '../../src/modules/campaign-sender/application/assign-campaign-senders.use-case';
import { ListCampaignSendersUseCase } from '../../src/modules/campaign-sender/application/list-campaign-senders.use-case';
import {
  AppNotFoundException,
  AppValidationException,
  AppConflictException,
} from '../../src/common/errors/application.exception';
import { IntegrationProvider, IntegrationStatus, SenderStatus, AssignmentStatus } from '@repo/db';

import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaClient } from '@repo/db';
import { randomUUID } from 'crypto';

// ─── helpers ───────────────────────────────────────────────────────────────

async function seed(prisma: PrismaClient) {
  const ws = await prisma.workspace.create({ data: { name: `WS-${randomUUID().slice(0, 8)}` } });
  const ws2 = await prisma.workspace.create({ data: { name: `WS2-${randomUUID().slice(0, 8)}` } });
  const company = await prisma.company.create({
    data: { workspaceId: ws.id, name: 'Acme', domain: 'acme.com', normalizedName: 'acme' },
  });
  const campaign = await prisma.campaign.create({
    data: { workspaceId: ws.id, companyId: company.id, name: 'Camp A', normalizedName: 'camp a' },
  });
  return { ws, ws2, company, campaign };
}

async function createIntegration(prisma: PrismaClient, workspaceId: string, overrides: any = {}) {
  return prisma.integration.create({
    data: {
      workspaceId,
      provider: IntegrationProvider.RESEND,
      secretReference: 'env://RESEND_KEY',
      name: overrides.name ?? `integ-${randomUUID().slice(0, 6)}`,
      status: overrides.status ?? IntegrationStatus.INVALID_CREDENTIALS,
      ...overrides,
    },
  });
}

async function createSender(prisma: PrismaClient, workspaceId: string, integrationId: string, overrides: any = {}) {
  return prisma.senderAccount.create({
    data: {
      workspaceId,
      integrationId,
      fromName: overrides.fromName ?? 'Sender',
      fromEmail: overrides.fromEmail ?? `sender-${randomUUID().slice(0, 6)}@example.com`,
      dailyLimit: overrides.dailyLimit ?? 50,
      status: overrides.status ?? SenderStatus.ACTIVE,
    },
  });
}

// ─── suite ─────────────────────────────────────────────────────────────────

describe('Packet 9D-A: Integration & Sender Management (DB Integration)', () => {
  let realPrisma: PrismaClient;
  let prisma: PrismaService;

  // use cases
  let createIntegrationUC: CreateIntegrationUseCase;
  let getIntegrationUC: GetIntegrationUseCase;
  let listIntegrationsUC: ListIntegrationsUseCase;
  let disableIntegrationUC: DisableIntegrationUseCase;
  let createSenderUC: CreateSenderAccountUseCase;
  let updateSenderUC: UpdateSenderAccountUseCase;
  let listSendersUC: ListSenderAccountsUseCase;
  let assignSendersUC: AssignCampaignSendersUseCase;
  let listCampaignSendersUC: ListCampaignSendersUseCase;

  beforeAll(async () => {
    realPrisma = await setupTestDatabase();
    prisma = realPrisma as unknown as PrismaService;

    createIntegrationUC = new CreateIntegrationUseCase(prisma);
    getIntegrationUC = new GetIntegrationUseCase(prisma);
    listIntegrationsUC = new ListIntegrationsUseCase(prisma);
    disableIntegrationUC = new DisableIntegrationUseCase(prisma);
    createSenderUC = new CreateSenderAccountUseCase(prisma);
    updateSenderUC = new UpdateSenderAccountUseCase(prisma);
    listSendersUC = new ListSenderAccountsUseCase(prisma);
    assignSendersUC = new AssignCampaignSendersUseCase(prisma);
    listCampaignSendersUC = new ListCampaignSendersUseCase(prisma);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  // ── Integration CRUD ──────────────────────────────────────────────────────

  describe('Integration — creation invariants', () => {
    it('newly created integration starts INVALID_CREDENTIALS', async () => {
      const { ws } = await seed(prisma);
      const result = await createIntegrationUC.execute(ws.id, {
        name: 'My Resend',
        provider: IntegrationProvider.RESEND,
        secretReference: 'env://RESEND_KEY',
      });
      expect(result.status).toBe(IntegrationStatus.INVALID_CREDENTIALS);
    });

    it('rejects SES provider', async () => {
      const { ws } = await seed(prisma);
      await expect(
        createIntegrationUC.execute(ws.id, {
          name: 'SES',
          provider: IntegrationProvider.SES,
          secretReference: 'env://AWS_KEY',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('rejects SMTP provider', async () => {
      const { ws } = await seed(prisma);
      await expect(
        createIntegrationUC.execute(ws.id, {
          name: 'SMTP',
          provider: IntegrationProvider.SMTP,
          secretReference: 'env://SMTP_KEY',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('rejects duplicate name within same workspace', async () => {
      const { ws } = await seed(prisma);
      await createIntegrationUC.execute(ws.id, {
        name: 'Duplicate',
        provider: IntegrationProvider.RESEND,
        secretReference: 'env://KEY_A',
      });
      await expect(
        createIntegrationUC.execute(ws.id, {
          name: 'Duplicate',
          provider: IntegrationProvider.RESEND,
          secretReference: 'env://KEY_B',
        }),
      ).rejects.toThrow(AppConflictException);
    });

    it('allows same name in different workspaces', async () => {
      const { ws, ws2 } = await seed(prisma);
      await createIntegrationUC.execute(ws.id, { name: 'Shared', provider: IntegrationProvider.RESEND, secretReference: 'env://K1' });
      const result = await createIntegrationUC.execute(ws2.id, { name: 'Shared', provider: IntegrationProvider.RESEND, secretReference: 'env://K2' });
      expect(result.workspaceId).toBe(ws2.id);
    });
  });

  describe('Integration — cross-tenant isolation', () => {
    it("get: cannot fetch another workspace's integration", async () => {
      const { ws, ws2 } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await expect(getIntegrationUC.execute(ws2.id, integ.id)).rejects.toThrow(AppNotFoundException);
    });

    it("disable: cannot disable another workspace's integration", async () => {
      const { ws, ws2 } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await expect(disableIntegrationUC.execute(ws2.id, integ.id)).rejects.toThrow(AppNotFoundException);
    });

    it('list: only returns integrations for the requesting workspace', async () => {
      const { ws, ws2 } = await seed(prisma);
      await createIntegration(prisma, ws.id, { name: 'WS1-Integ' });
      await createIntegration(prisma, ws2.id, { name: 'WS2-Integ' });
      const results = await listIntegrationsUC.execute(ws.id);
      expect(results.every(i => i.workspaceId === ws.id)).toBe(true);
      expect(results).toHaveLength(1);
    });
  });

  describe('Integration — disable preserves record', () => {
    it('disable sets status to DISABLED without deleting the record', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id, { status: IntegrationStatus.ACTIVE });
      const disabled = await disableIntegrationUC.execute(ws.id, integ.id);
      expect(disabled.status).toBe(IntegrationStatus.DISABLED);
      expect(disabled.id).toBe(integ.id);
      // record still exists
      const found = await prisma.integration.findUnique({ where: { id: integ.id } });
      expect(found).not.toBeNull();
    });
  });

  // ── SenderAccount CRUD ───────────────────────────────────────────────────

  describe('SenderAccount — email canonicalization', () => {
    it('stores fromEmail trimmed and lowercased', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const sender = await createSenderUC.execute(ws.id, {
        integrationId: integ.id,
        fromName: 'Test',
        fromEmail: '  Alex@Company.COM  ',
      });
      expect(sender.fromEmail).toBe('alex@company.com');
    });

    it('stores replyTo trimmed and lowercased', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const sender = await createSenderUC.execute(ws.id, {
        integrationId: integ.id,
        fromName: 'Test',
        fromEmail: 'sender@test.com',
        replyTo: '  Reply@Company.COM  ',
      });
      expect(sender.replyTo).toBe('reply@company.com');
    });

    it('rejects canonical duplicate fromEmail (different case)', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'A', fromEmail: 'alex@company.com' });
      await expect(
        createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'B', fromEmail: 'Alex@Company.COM' }),
      ).rejects.toThrow(AppConflictException);
    });

    it('rejects canonical duplicate fromEmail (whitespace)', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'A', fromEmail: 'alex@company.com' });
      await expect(
        createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'B', fromEmail: '  alex@company.com  ' }),
      ).rejects.toThrow(AppConflictException);
    });
  });

  describe('SenderAccount — dailyLimit bounds', () => {
    it('accepts dailyLimit = 1', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s = await createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'T', fromEmail: 'a@a.com', dailyLimit: 1 });
      expect(s.dailyLimit).toBe(1);
    });

    it('accepts dailyLimit = 200', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s = await createSenderUC.execute(ws.id, { integrationId: integ.id, fromName: 'T', fromEmail: 'b@b.com', dailyLimit: 200 });
      expect(s.dailyLimit).toBe(200);
    });
  });

  describe('SenderAccount — workspace constraints', () => {
    it('rejects integration from a different workspace', async () => {
      const { ws, ws2 } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await expect(
        createSenderUC.execute(ws2.id, { integrationId: integ.id, fromName: 'T', fromEmail: 'x@x.com' }),
      ).rejects.toThrow(AppValidationException);
    });

    it('cross-workspace update is rejected', async () => {
      const { ws, ws2 } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const sender = await createSender(prisma, ws.id, integ.id);
      await expect(
        updateSenderUC.execute(ws2.id, sender.id, { fromName: 'Attacker' }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('list: only returns senders for requesting workspace', async () => {
      const { ws, ws2 } = await seed(prisma);
      const i1 = await createIntegration(prisma, ws.id);
      const i2 = await createIntegration(prisma, ws2.id);
      await createSender(prisma, ws.id, i1.id, { fromEmail: 'a@ws1.com' });
      await createSender(prisma, ws2.id, i2.id, { fromEmail: 'b@ws2.com' });
      const results = await listSendersUC.execute(ws.id);
      expect(results.every(s => s.workspaceId === ws.id)).toBe(true);
      expect(results).toHaveLength(1);
    });
  });

  describe('SenderAccount — update canonicalization & immutability', () => {
    it('canonicalizes fromEmail on update', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const sender = await createSender(prisma, ws.id, integ.id, { fromEmail: 'old@test.com' });
      const updated = await updateSenderUC.execute(ws.id, sender.id, { fromEmail: '  NEW@Company.COM  ' });
      expect(updated.fromEmail).toBe('new@company.com');
    });

    it('update duplicate canonical fromEmail rejected', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await createSender(prisma, ws.id, integ.id, { fromEmail: 'taken@test.com' });
      const sender2 = await createSender(prisma, ws.id, integ.id, { fromEmail: 'other@test.com' });
      await expect(
        updateSenderUC.execute(ws.id, sender2.id, { fromEmail: 'Taken@Test.COM' }),
      ).rejects.toThrow(AppConflictException);
    });

    it('integration health change does NOT mutate sender status', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id, { status: IntegrationStatus.ACTIVE });
      const sender = await createSender(prisma, ws.id, integ.id, { status: SenderStatus.ACTIVE });
      // Simulate integration going INVALID_CREDENTIALS
      await prisma.integration.update({ where: { id: integ.id }, data: { status: IntegrationStatus.INVALID_CREDENTIALS } });
      // Sender status must remain ACTIVE
      const reloaded = await prisma.senderAccount.findUnique({ where: { id: sender.id } });
      expect(reloaded?.status).toBe(SenderStatus.ACTIVE);
    });
  });

  describe('SenderAccount — public response safety', () => {
    it('list response includes integration status but not secretReference', async () => {
      const { ws } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      await createSender(prisma, ws.id, integ.id);
      const senders = await listSendersUC.execute(ws.id);
      for (const s of senders) {
        expect((s.integration as any).secretReference).toBeUndefined();
        expect((s.integration as any).metadata).toBeUndefined();
        // safe fields present
        expect(s.integration.status).toBeDefined();
        expect(s.integration.provider).toBeDefined();
      }
    });
  });

  // ── Campaign sender assignment ─────────────────────────────────────────

  describe('CampaignSenderAccount — assignment invariants', () => {
    it('rejects unknown campaign', async () => {
      const { ws } = await seed(prisma);
      await expect(
        assignSendersUC.execute(ws.id, randomUUID(), { senderAccountIds: [] }),
      ).rejects.toThrow(AppNotFoundException);
    });

    it('rejects sender IDs from different workspace', async () => {
      const { ws, ws2, campaign } = await seed(prisma);
      const integ2 = await createIntegration(prisma, ws2.id);
      const sender2 = await createSender(prisma, ws2.id, integ2.id);
      await expect(
        assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [sender2.id] }),
      ).rejects.toThrow(AppValidationException);
    });

    it('rejects partially invalid sender IDs (no partial writes)', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const validSender = await createSender(prisma, ws.id, integ.id);
      const fakeId = randomUUID();

      await expect(
        assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [validSender.id, fakeId] }),
      ).rejects.toThrow(AppValidationException);

      // No assignments should have been created
      const assignments = await prisma.campaignSenderAccount.findMany({ where: { campaignId: campaign.id } });
      expect(assignments).toHaveLength(0);
    });

    it('empty senderAccountIds removes all active assignments', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s1 = await createSender(prisma, ws.id, integ.id);
      // Pre-assign
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id] });
      // Now assign empty
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [] });
      const active = await listCampaignSendersUC.execute(ws.id, campaign.id);
      expect(active).toHaveLength(0);
    });

    it('transactional replacement: new set replaces old set atomically', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s1 = await createSender(prisma, ws.id, integ.id, { fromEmail: 'a@a.com' });
      const s2 = await createSender(prisma, ws.id, integ.id, { fromEmail: 'b@b.com' });
      // Assign s1
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id] });
      // Replace with s2
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s2.id] });
      const active = await listCampaignSendersUC.execute(ws.id, campaign.id);
      expect(active).toHaveLength(1);
      expect(active[0].senderAccountId).toBe(s2.id);
    });

    it('removed assignment can be reactivated', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s1 = await createSender(prisma, ws.id, integ.id, { fromEmail: 'a@a.com' });
      const s2 = await createSender(prisma, ws.id, integ.id, { fromEmail: 'b@b.com' });
      // Assign s1, then replace with s2 (s1 becomes REMOVED)
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id] });
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s2.id] });
      // Reactivate s1
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id, s2.id] });
      const active = await listCampaignSendersUC.execute(ws.id, campaign.id);
      const activeIds = active.map(a => a.senderAccountId).sort();
      expect(activeIds).toEqual([s1.id, s2.id].sort());
    });

    it('duplicate senderAccountIds in request are deduplicated', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s1 = await createSender(prisma, ws.id, integ.id);
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id, s1.id, s1.id] });
      const active = await listCampaignSendersUC.execute(ws.id, campaign.id);
      expect(active).toHaveLength(1);
    });

    it('identical assignment is idempotent', async () => {
      const { ws, campaign } = await seed(prisma);
      const integ = await createIntegration(prisma, ws.id);
      const s1 = await createSender(prisma, ws.id, integ.id);
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id] });
      await assignSendersUC.execute(ws.id, campaign.id, { senderAccountIds: [s1.id] });
      const active = await listCampaignSendersUC.execute(ws.id, campaign.id);
      expect(active).toHaveLength(1);
    });

    it('cross-workspace campaign assignment is rejected', async () => {
      const { ws, ws2 } = await seed(prisma);
      const company2 = await prisma.company.create({
        data: { workspaceId: ws2.id, name: 'Acme2', domain: 'acme2.com', normalizedName: 'acme2' },
      });
      const campaign2 = await prisma.campaign.create({
        data: { workspaceId: ws2.id, companyId: company2.id, name: 'Camp B', normalizedName: 'camp b' },
      });
      const integ = await createIntegration(prisma, ws.id);
      const sender = await createSender(prisma, ws.id, integ.id);
      // Attempt to assign ws sender to ws2 campaign using ws2 workspace context
      await expect(
        assignSendersUC.execute(ws2.id, campaign2.id, { senderAccountIds: [sender.id] }),
      ).rejects.toThrow(AppValidationException);
    });
  });
});
