import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaCampaignRepository } from '../../src/modules/campaign/infrastructure/prisma-campaign.repository';
import { PrismaCompanyRepository } from '../../src/modules/company/infrastructure/prisma-company.repository';
import { CreateCampaignUseCase } from '../../src/modules/campaign/application/create-campaign.use-case';
import { CampaignDuplicateNameException } from '../../src/modules/campaign/domain/campaign-duplicate-name.exception';
import { PrismaService } from '../../src/database/prisma.service';

const prisma = getTestPrismaClient();

describe('Campaign Canonical Concurrency & Race Recovery (Integration)', () => {
  let campaignRepo: PrismaCampaignRepository;
  let companyRepo: PrismaCompanyRepository;
  let useCase: CreateCampaignUseCase;

  beforeAll(async () => {
    await setupTestDatabase();
    // Wrap test prisma client as PrismaService for repositories
    const prismaService = prisma as unknown as PrismaService;
    campaignRepo = new PrismaCampaignRepository(prismaService);
    companyRepo = new PrismaCompanyRepository(prismaService);
    useCase = new CreateCampaignUseCase(campaignRepo, companyRepo);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  it('coalesces 10 concurrent requests with dash/casing/whitespace variants into exactly 1 campaign and 9 409 exceptions with existingCampaignId', async () => {
    // 1. Seed workspace & company
    const user = await prisma.user.create({
      data: {
        email: 'race-test@example.com',
        firstName: 'Race',
        lastName: 'User',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: 'Race Workspace',
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
    });

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Acme Corporation',
        normalizedName: 'acme corporation',
      },
    });

    // 2. 10 variants of the same canonical campaign name
    const variants = [
      'Outreach — Acme Corporation', // Em Dash (canonical)
      'Outreach – Acme Corporation', // En Dash
      'Outreach - Acme Corporation', // Hyphen-minus
      '  Outreach — Acme Corporation  ', // Whitespace padded
      'outreach — acme corporation', // Lowercase
      'OUTREACH — ACME CORPORATION', // Uppercase
      'Outreach —   Acme    Corporation', // Collapsible multi-space
      'Outreach − Acme Corporation', // Minus sign
      'Outreach ‑ Acme Corporation', // Non-breaking hyphen
      'Outreach — Acme Corporation', // Duplicate identical
    ];

    // 3. Fire all 10 simultaneously in real PostgreSQL
    const results = await Promise.allSettled(
      variants.map((name) =>
        useCase.execute(workspace.id, {
          companyId: company.id,
          senderAccountId: 'snd-1',
          templateId: 'tpl-1',
          status: 'DRAFT',
          name,
        }),
      ),
    );

    // 4. Assert exact 1 winner, 9 losers
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);

    const winner = fulfilled[0].value;
    expect(winner.normalizedName).toBe('outreach — acme corporation');
    expect(winner.companyId).toBe(company.id);

    // 5. Assert all 9 rejections are CampaignDuplicateNameException carrying the winning ID
    for (const rej of rejected) {
      expect(rej.reason).toBeInstanceOf(CampaignDuplicateNameException);
      const dupEx = rej.reason as CampaignDuplicateNameException;
      expect(dupEx.existingCampaignId).toBe(winner.id);
      expect(dupEx.getStatus()).toBe(409);
      expect(dupEx.code).toBe('CAMPAIGN_ALREADY_EXISTS');
    }

    // 6. Assert DB has exactly 1 row
    const count = await prisma.campaign.count({
      where: {
        workspaceId: workspace.id,
        companyId: company.id,
        senderAccountId: 'snd-1',
        templateId: 'tpl-1',
        status: 'DRAFT',
        normalizedName: 'outreach — acme corporation',
      },
    });
    expect(count).toBe(1);
  });
});
