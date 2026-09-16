import { PrismaClient } from '@repo/db';
import {
  cleanTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';
import {
  createTestUser,
  createTestWorkspace,
  createTestWorkspaceMember,
} from '../helpers/factories';

describe('Tenant Isolation Machinery (Integration)', () => {
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

  it('should strictly isolate workspace members between tenants', async () => {
    // 1. Seed Tenant A
    const userA = await createTestUser(prisma, { name: 'Tenant A User' });
    const wsA = await createTestWorkspace(prisma, { name: 'Workspace A' });
    const memberA = await createTestWorkspaceMember(prisma, {
      userId: userA.id,
      workspaceId: wsA.id,
    });

    // 2. Seed Tenant B
    const userB = await createTestUser(prisma, { name: 'Tenant B User' });
    const wsB = await createTestWorkspace(prisma, { name: 'Workspace B' });
    const memberB = await createTestWorkspaceMember(prisma, {
      userId: userB.id,
      workspaceId: wsB.id,
    });

    // 3. Workspace A scoped query returns Member A, excludes Member B
    const membersInWsA = await prisma.workspaceMember.findMany({
      where: { workspaceId: wsA.id },
    });
    expect(membersInWsA).toHaveLength(1);
    expect(membersInWsA[0].id).toBe(memberA.id);
    expect(membersInWsA[0].userId).toBe(userA.id);

    // 4. Workspace B scoped query returns Member B, excludes Member A
    const membersInWsB = await prisma.workspaceMember.findMany({
      where: { workspaceId: wsB.id },
    });
    expect(membersInWsB).toHaveLength(1);
    expect(membersInWsB[0].id).toBe(memberB.id);
    expect(membersInWsB[0].userId).toBe(userB.id);

    // 5. Cross-tenant direct query attempt: Tenant A context seeking Member B
    const crossTenantResult = await prisma.workspaceMember.findFirst({
      where: {
        id: memberB.id,
        workspaceId: wsA.id,
      },
    });
    expect(crossTenantResult).toBeNull();
  });
});
