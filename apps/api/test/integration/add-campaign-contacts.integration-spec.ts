import { PrismaClient } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { PrismaCampaignRepository } from '../../src/modules/campaign/infrastructure/prisma-campaign.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { AddCampaignContactsUseCase } from '../../src/modules/campaign/application/add-campaign-contacts.use-case';
import { PrismaService } from '../../src/database/prisma.service';
import { AppNotFoundException } from '../../src/common/errors/application.exception';

jest.unmock('@repo/db');

describe('AddCampaignContacts (PostgreSQL Integration)', () => {
  let realPrisma: PrismaClient;
  let campaignRepo: PrismaCampaignRepository;
  let contactRepo: PrismaContactRepository;
  let useCase: AddCampaignContactsUseCase;

  // Seeded entity IDs
  let workspaceId: string;
  let companyId: string;
  let campaignId: string;
  let contactId1: string;
  let contactId2: string;

  beforeAll(async () => {
    realPrisma = await setupTestDatabase();
    const prismaService = realPrisma as unknown as PrismaService;
    campaignRepo = new PrismaCampaignRepository(prismaService);
    contactRepo = new PrismaContactRepository(prismaService);
    useCase = new AddCampaignContactsUseCase(campaignRepo, contactRepo);
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    // Seed workspace, company, campaign, and two contacts
    const workspace = await realPrisma.workspace.create({
      data: { name: 'IntegrationWS' },
    });
    workspaceId = workspace.id;

    const company = await realPrisma.company.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        name: 'Integration Corp',
        normalizedName: 'integration corp',
      },
    });
    companyId = company.id;

    const campaign = await realPrisma.campaign.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        company: { connect: { id: companyId } },
        name: 'Integration Campaign',
      },
    });
    campaignId = campaign.id;

    const contact1 = await realPrisma.contact.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        company: { connect: { id: companyId } },
        name: 'Contact One',
        email: 'one@example.com',
      },
    });
    contactId1 = contact1.id;

    const contact2 = await realPrisma.contact.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        company: { connect: { id: companyId } },
        name: 'Contact Two',
        email: 'two@example.com',
      },
    });
    contactId2 = contact2.id;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('creates exactly zero CampaignContact records when the request contains an invalid contact', async () => {
    const invalidContactId = '00000000-0000-0000-0000-000000000000';

    await expect(
      useCase.execute(workspaceId, campaignId, {
        contactIds: [contactId1, invalidContactId],
      }),
    ).rejects.toThrow(AppNotFoundException);

    const count = await realPrisma.campaignContact.count({
      where: { campaignId },
    });
    expect(count).toBe(0);
  });

  it('submitting the same valid contact twice creates exactly one binding', async () => {
    const firstResult = await useCase.execute(workspaceId, campaignId, {
      contactIds: [contactId1],
    });
    expect(firstResult.bound).toHaveLength(1);
    expect(firstResult.ignoredDuplicateCount).toBe(0);

    const countAfterFirst = await realPrisma.campaignContact.count({
      where: { campaignId },
    });
    expect(countAfterFirst).toBe(1);

    const secondResult = await useCase.execute(workspaceId, campaignId, {
      contactIds: [contactId1],
    });
    expect(secondResult.bound).toHaveLength(0);
    expect(secondResult.ignoredDuplicateCount).toBe(1);

    const countAfterSecond = await realPrisma.campaignContact.count({
      where: { campaignId },
    });
    expect(countAfterSecond).toBe(1);
  });

  it('retrying an existing binding does not change status, subject, or body', async () => {
    await useCase.execute(workspaceId, campaignId, {
      contactIds: [contactId1],
    });

    const binding = await realPrisma.campaignContact.findFirst({
      where: { campaignId, contactId: contactId1 },
    });
    expect(binding).not.toBeNull();

    await realPrisma.campaignContact.update({
      where: { id: binding!.id },
      data: {
        status: 'READY',
        currentSubject: 'Subject after review',
        currentBody: 'Body after review',
      },
    });

    const retryResult = await useCase.execute(workspaceId, campaignId, {
      contactIds: [contactId1],
    });
    expect(retryResult.bound).toHaveLength(0);
    expect(retryResult.ignoredDuplicateCount).toBe(1);

    const unchanged = await realPrisma.campaignContact.findFirst({
      where: { campaignId, contactId: contactId1 },
    });
    expect(unchanged!.status).toBe('READY');
    expect(unchanged!.currentSubject).toBe('Subject after review');
    expect(unchanged!.currentBody).toBe('Body after review');

    const totalCount = await realPrisma.campaignContact.count({
      where: { campaignId },
    });
    expect(totalCount).toBe(1);
  });

  it('newly created bindings always have status PENDING', async () => {
    const result = await useCase.execute(workspaceId, campaignId, {
      contactIds: [contactId1, contactId2],
    });
    expect(result.bound).toHaveLength(2);
    expect(result.ignoredDuplicateCount).toBe(0);

    const bindings = await realPrisma.campaignContact.findMany({
      where: { campaignId },
    });

    expect(bindings).toHaveLength(2);
    for (const b of bindings) {
      expect(b.status).toBe('PENDING');
    }
  });

  it('findExistingContactBindings returns only the subset of already-bound IDs', async () => {
    await campaignRepo.createContactBindings(workspaceId, campaignId, [
      contactId1,
    ]);

    const existing = await campaignRepo.findExistingContactBindings(
      workspaceId,
      campaignId,
      [contactId1, contactId2],
    );

    expect(existing.has(contactId1)).toBe(true);
    expect(existing.has(contactId2)).toBe(false);
  });
});
