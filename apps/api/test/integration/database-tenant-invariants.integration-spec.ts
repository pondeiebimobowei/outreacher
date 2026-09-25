jest.unmock('@repo/db');
import {
  PrismaClient,
  IntegrationProvider,
  IntegrationStatus,
  SenderStatus,
  AssignmentStatus,
  evaluateCampaigns,
} from '@repo/db';
import { randomUUID } from 'crypto';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { createTestWorkspace } from '../helpers/factories';

describe('Database Tenant Invariants & BYO Provider Rules (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function createCompany(workspaceId: string) {
    const name = `Company ${randomUUID().substring(0, 8)}`;
    return prisma.company.create({
      data: {
        workspaceId,
        name,
        normalizedName: name.toLowerCase(),
      },
    });
  }

  async function createCampaign(workspaceId: string, companyId: string) {
    const name = `Campaign ${randomUUID().substring(0, 8)}`;
    return prisma.campaign.create({
      data: {
        workspaceId,
        companyId,
        senderAccountId: '',
        templateId: '',
        name,
        normalizedName: name.toLowerCase(),
      },
    });
  }

  async function createIntegration(
    workspaceId: string,
    name = `Integration ${randomUUID().substring(0, 8)}`,
  ) {
    return prisma.integration.create({
      data: {
        workspaceId,
        name,
        provider: IntegrationProvider.RESEND,
        secretReference: 'vault://secret-ref',
        status: IntegrationStatus.ACTIVE,
      },
    });
  }

  async function createSenderAccount(
    workspaceId: string,
    integrationId: string,
    fromEmail = `sender-${randomUUID().substring(0, 8)}@example.com`,
    dailyLimit = 50,
  ) {
    return prisma.senderAccount.create({
      data: {
        workspaceId,
        integrationId,
        fromName: 'Test Sender',
        fromEmail,
        dailyLimit,
        status: SenderStatus.ACTIVE,
      },
    });
  }

  describe('1. Cross-Workspace FK Rejections', () => {
    it('should reject creating a SenderAccount when integrationId belongs to another workspace', async () => {
      const wsA = await createTestWorkspace(prisma, { name: 'Workspace A' });
      const wsB = await createTestWorkspace(prisma, { name: 'Workspace B' });

      const integrationB = await createIntegration(wsB.id, 'Provider B');

      // Attempting to insert a SenderAccount for wsA referencing integrationB (which belongs to wsB)
      // This MUST fail at the database level via composite FK (workspace_id, integration_id)
      await expect(
        prisma.senderAccount.create({
          data: {
            workspaceId: wsA.id,
            integrationId: integrationB.id,
            fromName: 'Attacker Sender',
            fromEmail: 'cross@example.com',
            dailyLimit: 50,
          },
        }),
      ).rejects.toThrow();

      // Verify with raw SQL that the exact PostgreSQL foreign key constraint is triggered
      await expect(
        prisma.$executeRaw`
          INSERT INTO "sender_accounts" ("id", "workspace_id", "integration_id", "from_name", "from_email", "daily_limit", "status", "created_at", "updated_at")
          VALUES (${randomUUID()}, ${wsA.id}, ${integrationB.id}, 'Raw Cross', 'rawcross@example.com', 50, 'ACTIVE'::"SenderStatus", NOW(), NOW());
        `,
      ).rejects.toThrow(/foreign key|violates foreign key constraint/i);
    });

    it('should reject creating a CampaignSenderAccount when campaignId belongs to another workspace', async () => {
      const wsA = await createTestWorkspace(prisma, { name: 'Workspace A' });
      const wsB = await createTestWorkspace(prisma, { name: 'Workspace B' });

      const companyB = await createCompany(wsB.id);
      const campaignB = await createCampaign(wsB.id, companyB.id);

      const integrationA = await createIntegration(wsA.id, 'Provider A');
      const senderA = await createSenderAccount(
        wsA.id,
        integrationA.id,
        'sender-a@example.com',
      );

      // Attempting to bind senderA (wsA) to campaignB (wsB) with workspaceId wsA
      await expect(
        prisma.campaignSenderAccount.create({
          data: {
            workspaceId: wsA.id,
            campaignId: campaignB.id,
            senderAccountId: senderA.id,
          },
        }),
      ).rejects.toThrow();

      // Raw SQL verification
      await expect(
        prisma.$executeRaw`
          INSERT INTO "campaign_sender_accounts" ("id", "workspace_id", "campaign_id", "sender_account_id", "status", "created_at", "updated_at")
          VALUES (${randomUUID()}, ${wsA.id}, ${campaignB.id}, ${senderA.id}, 'ACTIVE'::"AssignmentStatus", NOW(), NOW());
        `,
      ).rejects.toThrow(/foreign key|violates foreign key constraint/i);
    });

    it('should reject creating a CampaignSenderAccount when senderAccountId belongs to another workspace', async () => {
      const wsA = await createTestWorkspace(prisma, { name: 'Workspace A' });
      const wsB = await createTestWorkspace(prisma, { name: 'Workspace B' });

      const companyA = await createCompany(wsA.id);
      const campaignA = await createCampaign(wsA.id, companyA.id);

      const integrationB = await createIntegration(wsB.id, 'Provider B');
      const senderB = await createSenderAccount(
        wsB.id,
        integrationB.id,
        'sender-b@example.com',
      );

      // Attempting to bind senderB (wsB) to campaignA (wsA) with workspaceId wsA
      await expect(
        prisma.campaignSenderAccount.create({
          data: {
            workspaceId: wsA.id,
            campaignId: campaignA.id,
            senderAccountId: senderB.id,
          },
        }),
      ).rejects.toThrow();

      // Raw SQL verification
      await expect(
        prisma.$executeRaw`
          INSERT INTO "campaign_sender_accounts" ("id", "workspace_id", "campaign_id", "sender_account_id", "status", "created_at", "updated_at")
          VALUES (${randomUUID()}, ${wsA.id}, ${campaignA.id}, ${senderB.id}, 'ACTIVE'::"AssignmentStatus", NOW(), NOW());
        `,
      ).rejects.toThrow(/foreign key|violates foreign key constraint/i);
    });
  });

  describe('2. daily_limit CHECK Constraint', () => {
    it('should reject daily_limit < 1 (e.g. 0 or negative)', async () => {
      const ws = await createTestWorkspace(prisma);
      const integration = await createIntegration(ws.id);

      await expect(
        prisma.senderAccount.create({
          data: {
            workspaceId: ws.id,
            integrationId: integration.id,
            fromName: 'Zero Limit',
            fromEmail: 'zero@example.com',
            dailyLimit: 0,
          },
        }),
      ).rejects.toThrow(/sender_accounts_daily_limit_check|check constraint/i);

      await expect(
        prisma.$executeRaw`
          INSERT INTO "sender_accounts" ("id", "workspace_id", "integration_id", "from_name", "from_email", "daily_limit", "status", "created_at", "updated_at")
          VALUES (${randomUUID()}, ${ws.id}, ${integration.id}, 'Negative Limit', 'neg@example.com', -10, 'ACTIVE'::"SenderStatus", NOW(), NOW());
        `,
      ).rejects.toThrow(/sender_accounts_daily_limit_check|check constraint/i);
    });

    it('should reject daily_limit > 200 (e.g. 201)', async () => {
      const ws = await createTestWorkspace(prisma);
      const integration = await createIntegration(ws.id);

      await expect(
        prisma.senderAccount.create({
          data: {
            workspaceId: ws.id,
            integrationId: integration.id,
            fromName: 'Over Limit',
            fromEmail: 'over@example.com',
            dailyLimit: 201,
          },
        }),
      ).rejects.toThrow(/sender_accounts_daily_limit_check|check constraint/i);
    });

    it('should succeed for boundary values 1, 50, and 200', async () => {
      const ws = await createTestWorkspace(prisma);
      const integration = await createIntegration(ws.id);

      const sender1 = await createSenderAccount(
        ws.id,
        integration.id,
        'limit1@example.com',
        1,
      );
      expect(sender1.dailyLimit).toBe(1);

      const sender50 = await createSenderAccount(
        ws.id,
        integration.id,
        'limit50@example.com',
        50,
      );
      expect(sender50.dailyLimit).toBe(50);

      const sender200 = await createSenderAccount(
        ws.id,
        integration.id,
        'limit200@example.com',
        200,
      );
      expect(sender200.dailyLimit).toBe(200);
    });
  });

  describe('3. Delete Cascades and Restrictions', () => {
    it('should reject deleting an Integration referenced by a SenderAccount (RESTRICT)', async () => {
      const ws = await createTestWorkspace(prisma);
      const integration = await createIntegration(ws.id);
      await createSenderAccount(ws.id, integration.id, 's1@example.com');

      await expect(
        prisma.integration.delete({
          where: { id: integration.id },
        }),
      ).rejects.toThrow();
    });

    it('should reject deleting a SenderAccount referenced by a CampaignSenderAccount (RESTRICT)', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const campaign = await createCampaign(ws.id, company.id);
      const integration = await createIntegration(ws.id);
      const sender = await createSenderAccount(
        ws.id,
        integration.id,
        's2@example.com',
      );

      await prisma.campaignSenderAccount.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          senderAccountId: sender.id,
        },
      });

      await expect(
        prisma.senderAccount.delete({
          where: { id: sender.id },
        }),
      ).rejects.toThrow();
    });

    it('should CASCADE delete CampaignSenderAccount when Campaign is deleted', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const campaign = await createCampaign(ws.id, company.id);
      const integration = await createIntegration(ws.id);
      const sender = await createSenderAccount(
        ws.id,
        integration.id,
        's3@example.com',
      );

      const binding = await prisma.campaignSenderAccount.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          senderAccountId: sender.id,
        },
      });

      // Delete Campaign
      await prisma.campaign.delete({
        where: { id: campaign.id },
      });

      // Binding should be gone
      const foundBinding = await prisma.campaignSenderAccount.findUnique({
        where: { id: binding.id },
      });
      expect(foundBinding).toBeNull();

      // Sender account should still exist
      const foundSender = await prisma.senderAccount.findUnique({
        where: { id: sender.id },
      });
      expect(foundSender).not.toBeNull();
    });

    it('should CASCADE delete Integrations, SenderAccounts, and CampaignSenderAccounts when Workspace is deleted', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const campaign = await createCampaign(ws.id, company.id);
      const integration = await createIntegration(ws.id);
      const sender = await createSenderAccount(
        ws.id,
        integration.id,
        's4@example.com',
      );

      const binding = await prisma.campaignSenderAccount.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          senderAccountId: sender.id,
        },
      });

      // Delete Workspace
      await prisma.workspace.delete({
        where: { id: ws.id },
      });

      expect(
        await prisma.integration.findUnique({ where: { id: integration.id } }),
      ).toBeNull();
      expect(
        await prisma.senderAccount.findUnique({ where: { id: sender.id } }),
      ).toBeNull();
      expect(
        await prisma.campaignSenderAccount.findUnique({
          where: { id: binding.id },
        }),
      ).toBeNull();
      expect(
        await prisma.campaign.findUnique({ where: { id: campaign.id } }),
      ).toBeNull();
    });
  });

  describe('4. Legacy Column Integrity', () => {
    it('should preserve existing campaign sending_identity column values and types', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);

      const name = 'Legacy Identity Campaign';
      // Create a campaign with explicit sending_identity
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          templateId: '',
          name,
          normalizedName: name.toLowerCase(),
          senderAccountId: 'Legacy Founder <founder@legacy-startup.com>',
        },
      });

      const fetched = await prisma.campaign.findUnique({
        where: { id: campaign.id },
      });

      expect(fetched).not.toBeNull();
      expect(fetched?.senderAccountId).toBe(
        'Legacy Founder <founder@legacy-startup.com>',
      );

      // Verify database column exists directly via information_schema
      const columns = await prisma.$queryRaw<
        Array<{ column_name: string; data_type: string; is_nullable: string }>
      >`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'campaigns' AND column_name = 'sending_identity';
      `;

      expect(columns).toHaveLength(1);
      expect(columns[0].column_name).toBe('sending_identity');
      expect(columns[0].is_nullable).toBe('YES');
    });
  });

  describe('5. Backfill Classification Exhaustive Rules (Authoritative Evidence vs Unsafe Inference)', () => {
    it('should classify campaign with NULL/empty identity as UNMIGRATED_NEEDS_SENDER', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const name = 'Null Identity Campaign';
      await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          templateId: '',
          name,
          normalizedName: name.toLowerCase(),
          senderAccountId: '',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      expect(evalItem?.classification).toBe('UNMIGRATED_NEEDS_SENDER');
    });

    it('should classify campaign with unparseable identity as UNMIGRATED_INVALID_LEGACY_IDENTITY', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const name = 'Invalid Identity Campaign';
      await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          templateId: '',
          name,
          normalizedName: name.toLowerCase(),
          senderAccountId: 'This is not an email address',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      expect(evalItem?.classification).toBe(
        'UNMIGRATED_INVALID_LEGACY_IDENTITY',
      );
      expect(evalItem?.reason).toContain('is malformed and cannot be parsed');
    });

    it('REGRESSION TEST: valid legacy identity + exactly one active integration + no historical ownership evidence = NOT PROVABLY_ASSOCIABLE (UNMIGRATED_NEEDS_SENDER)', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      // Workspace has exactly ONE active integration
      const soleIntegration = await createIntegration(
        ws.id,
        'Sole Resend Provider',
      );

      const name = 'Sole Integration No Provenance Campaign';
      await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          name,
          templateId: '',
          normalizedName: name.toLowerCase(),
          senderAccountId: 'Alice <alice@startup.io>',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      // CRITICAL GATE: Must NOT be PROVABLY_ASSOCIABLE. Having 1 integration is not proof of ownership!
      expect(evalItem?.classification).not.toBe('PROVABLY_ASSOCIABLE');
      expect(evalItem?.classification).toBe('UNMIGRATED_NEEDS_SENDER');
      expect(evalItem?.reason).toContain(
        'Provider ownership cannot be inferred from workspace integrations alone',
      );
      expect(evalItem?.proposedAction).not.toContain('Upsert SenderAccount');
    });

    it('should classify valid legacy identity with multiple integrations but no sender account as UNMIGRATED_NEEDS_SENDER', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      await createIntegration(ws.id, 'Resend Alpha');
      await createIntegration(ws.id, 'SES Beta');

      const name = 'Multiple Integrations No Provenance Campaign';
      await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          name,
          templateId: '',
          normalizedName: name.toLowerCase(),
          senderAccountId: 'Alice <alice@startup.io>',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      expect(evalItem?.classification).toBe('UNMIGRATED_NEEDS_SENDER');
      expect(evalItem?.reason).toContain(
        'Provider ownership cannot be inferred from workspace integrations alone',
      );
    });

    it('should classify campaign as PROVABLY_ASSOCIABLE when authoritative SenderAccount exists and historical sends match', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const integration = await createIntegration(
        ws.id,
        'Verified Resend Provider',
      );
      // Authoritative tenant evidence: SenderAccount already provisioned for alice@startup.io
      const senderAccount = await createSenderAccount(
        ws.id,
        integration.id,
        'alice@startup.io',
      );

      const name = 'Provably Associable Campaign';
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          name,
          templateId: '',
          normalizedName: name.toLowerCase(),
          senderAccountId: 'Alice <alice@startup.io>',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      expect(evalItem?.classification).toBe('PROVABLY_ASSOCIABLE');
      expect(evalItem?.reason).toContain('Authoritative evidence verified');
      expect(evalItem?.proposedAction).toBe(
        `Link existing SenderAccount (id="${senderAccount.id}") to Campaign via CampaignSenderAccount.`,
      );
    });

    it('should classify campaign as AMBIGUOUS when historical EmailSends contradict the configured SenderAccount provider', async () => {
      const ws = await createTestWorkspace(prisma);
      const company = await createCompany(ws.id);
      const contact = await prisma.person.create({
        data: {
          workspaceId: ws.id,

          firstName: 'Target Contact',
          lastName: 'Contact',
          email: 'target@example.com',
        },
      });

      // Integration is RESEND
      const integration = await createIntegration(ws.id, 'Resend Provider');
      const senderAccount = await createSenderAccount(
        ws.id,
        integration.id,
        'alice@startup.io',
      );

      const name = 'Conflicting History Campaign';
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ws.id,
          companyId: company.id,
          name,
          templateId: '',
          normalizedName: name.toLowerCase(),
          senderAccountId: 'Alice <alice@startup.io>',
        },
      });

      const campaignMember = await prisma.campaignMember.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          personId: contact.id,
        },
      });

      // Historical send recorded provider 'SES', contradicting the RESEND integration
      await prisma.emailSend.create({
        data: {
          workspaceId: ws.id,
          campaignId: campaign.id,
          subject: 'Historical Subject',
          body: 'Historical Body',
          provider: 'SES',
          status: 'SENT',
        },
      });

      const evaluations = await evaluateCampaigns(prisma);
      const evalItem = evaluations.find((e) => e.workspaceId === ws.id);

      expect(evalItem).toBeDefined();
      expect(evalItem?.classification).toBe('AMBIGUOUS');
      expect(evalItem?.reason).toContain('Conflicting historical evidence');
      expect(evalItem?.proposedAction).toContain(
        'Require manual operator review in UI',
      );
    });
  });
});
