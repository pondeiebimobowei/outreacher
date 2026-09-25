import { PrismaClient } from '@repo/db';
import { ApproveDraftUseCase } from '../../src/modules/outreach/application/approve-draft.use-case';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import { AppConflictException } from '../../src/common/errors/application.exception';

describe('ApproveDraftUseCase (Concurrency Integration)', () => {
  let realPrisma: PrismaClient;

  beforeAll(async () => {
    realPrisma = await setupTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('should abort with 409 CONFLICT if a concurrent mutation changes updatedAt', async () => {
    // 1. Seed
    const workspace = await realPrisma.workspace.create({
      data: { name: 'WS' },
    });
    const company = await realPrisma.company.create({
      data: {
        workspace: { connect: { id: workspace.id } },
        name: 'Test Company',
        normalizedName: 'test company',
        domain: 'testcompany.com',
      },
    });
    const contact = await realPrisma.person.create({
      data: {
        workspace: { connect: { id: workspace.id } },

        email: 'test@example.com',
        firstName: '',
        lastName: ''
      },
    });
    const campaign = await realPrisma.campaign.create({
      data: {
        workspace: { connect: { id: workspace.id } },
        company: { connect: { id: company.id } },
        name: 'Camp',
        templateId: '',
        senderAccountId: '',

        normalizedName: 'camp',
      },
    });

    const campaignMember = await realPrisma.campaignMember.create({
      data: {
        workspace: { connect: { id: workspace.id } },
        person: { connect: { id: contact.id } },
        campaign: { connect: { id: campaign.id } },
        status: 'PENDING',
        currentSubject: 'Valid subject',
        currentBody: 'Valid body with more than 20 characters',
      },
    });

    // 2. Create Proxy to simulate race condition
    // We intercept findUnique to inject a concurrent database update right before updateMany runs.
    const prismaProxy = new Proxy(realPrisma, {
      get(target, prop) {
        if (prop === '$transaction') {
          return async (fn: any) => {
            return target.$transaction(async (tx: any) => {
              const txProxy = new Proxy(tx, {
                get(tTarget, tProp) {
                  if (tProp === 'campaignMember') {
                    return new Proxy(tTarget.campaignMember, {
                      get(ccTarget, ccProp) {
                        if (ccProp === 'findUnique') {
                          return async (args: any) => {
                            // First, perform the actual findUnique inside the transaction
                            const result = await ccTarget.findUnique(args);

                            // SIMULATE CONCURRENT MUTATION
                            // We use the main realPrisma connection to update the row out-of-band.
                            // This bumps the updatedAt timestamp in Postgres, simulating a race.
                            if (args.where.id === campaignMember.id) {
                              await realPrisma.campaignMember.update({
                                where: { id: campaignMember.id },
                                data: { currentSubject: 'Concurrent edit' },
                              });
                            }

                            // Return the original result (with old updatedAt) to the use-case
                            return result;
                          };
                        }
                        return ccTarget[ccProp];
                      },
                    });
                  }
                  if (tProp === 'suppression') {
                    // Pass through suppression unmodified
                    return tTarget.suppression;
                  }
                  return tTarget[tProp];
                },
              });
              return fn(txProxy);
            });
          };
        }
        return (target as any)[prop];
      },
    });

    const useCase = new ApproveDraftUseCase(prismaProxy as any);

    // 3. Execute and verify it throws 409 AppConflictException
    await expect(
      useCase.execute({
        workspaceId: workspace.id,
        campaignMemberId: '',
      }),
    ).rejects.toThrow(AppConflictException);

    // 4. Verify persisted final state remains PENDING
    const finalContact = await realPrisma.campaignMember.findUnique({
      where: { id: campaignMember.id },
    });

    expect(finalContact).toBeDefined();
    expect(finalContact!.status).toBe('PENDING');
    // Also verify the concurrent edit succeeded
    expect(finalContact!.currentSubject).toBe('Concurrent edit');
  });
});
