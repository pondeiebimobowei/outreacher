import { PrismaClient, WorkspaceRole } from '@repo/db';
import { randomUUID } from 'crypto';

export interface UserOverride {
  id?: string;
  email?: string;
  name?: string | null;
}

export interface WorkspaceOverride {
  id?: string;
  name?: string;
}

export interface WorkspaceMemberOverride {
  id?: string;
  workspaceId?: string;
  userId?: string;
  role?: WorkspaceRole;
}

export async function createTestUser(
  client: PrismaClient,
  overrides: UserOverride = {},
) {
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? `user-${id.substring(0, 8)}@example.com`;
  const name =
    overrides.name !== undefined
      ? overrides.name
      : `Test User ${id.substring(0, 8)}`;

  return client.user.create({
    data: {
      id,
      email,
      name,
    },
  });
}

export async function createTestWorkspace(
  client: PrismaClient,
  overrides: WorkspaceOverride = {},
) {
  const id = overrides.id ?? randomUUID();
  const name = overrides.name ?? `Test Workspace ${id.substring(0, 8)}`;

  return client.workspace.create({
    data: {
      id,
      name,
    },
  });
}

export async function createTestWorkspaceMember(
  client: PrismaClient,
  overrides: WorkspaceMemberOverride = {},
) {
  const id = overrides.id ?? randomUUID();
  let workspaceId = overrides.workspaceId;
  let userId = overrides.userId;

  if (!workspaceId) {
    const ws = await createTestWorkspace(client);
    workspaceId = ws.id;
  }

  if (!userId) {
    const user = await createTestUser(client);
    userId = user.id;
  }

  return client.workspaceMember.create({
    data: {
      id,
      workspaceId,
      userId,
      role: overrides.role ?? WorkspaceRole.OWNER,
    },
  });
}
