import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WorkspaceRole } from '@repo/db';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import {
  AppForbiddenException,
  AppUnauthorizedException,
} from '../../common/errors/application.exception';

describe('AuthService - validateSession', () => {
  let authService: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    workspaceMember: { findUnique: jest.Mock; findFirst: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      workspaceMember: { findUnique: jest.fn(), findFirst: jest.fn() },
      workspace: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('returns workspace ownerId as user ID when authenticated user is the workspace OWNER', async () => {
    const userId = 'user-owner-123';
    const workspaceId = 'workspace-abc-456';

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'owner@example.com',
      name: 'Owner User',
    });

    prisma.workspaceMember.findUnique.mockResolvedValue({
      workspaceId,
      userId,
      role: WorkspaceRole.OWNER,
      workspace: {
        id: workspaceId,
        name: 'Acme Workspace',
      },
    });

    const session = await authService.validateSession(userId, workspaceId);

    expect(session.user.id).toBe(userId);
    expect(session.workspace.id).toBe(workspaceId);
    expect(session.workspace.ownerId).toBe(userId);
    // Crucial regression check: ownerId must NOT equal the workspaceId
    expect(session.workspace.ownerId).not.toBe(workspaceId);
    expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns actual workspace owner user ID when authenticated user is a non-owner MEMBER', async () => {
    const memberUserId = 'user-member-789';
    const ownerUserId = 'user-owner-123';
    const workspaceId = 'workspace-abc-456';

    prisma.user.findUnique.mockResolvedValue({
      id: memberUserId,
      email: 'member@example.com',
      name: 'Member User',
    });

    prisma.workspaceMember.findUnique.mockResolvedValue({
      workspaceId,
      userId: memberUserId,
      role: 'MEMBER' as unknown as WorkspaceRole,
      workspace: {
        id: workspaceId,
        name: 'Shared Workspace',
      },
    });

    prisma.workspaceMember.findFirst.mockResolvedValue({
      userId: ownerUserId,
      role: WorkspaceRole.OWNER,
    });

    const session = await authService.validateSession(
      memberUserId,
      workspaceId,
    );

    expect(session.user.id).toBe(memberUserId);
    expect(session.workspace.id).toBe(workspaceId);
    // ownerId must be the actual workspace owner's user ID, NOT the member's user ID and NOT the workspace ID
    expect(session.workspace.ownerId).toBe(ownerUserId);
    expect(session.workspace.ownerId).not.toBe(memberUserId);
    expect(session.workspace.ownerId).not.toBe(workspaceId);
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId,
        role: WorkspaceRole.OWNER,
      },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('throws AppUnauthorizedException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.validateSession('unknown-user', 'workspace-1'),
    ).rejects.toThrow(AppUnauthorizedException);
  });

  it('throws AppForbiddenException when user is not a member of the workspace', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
    });
    prisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      authService.validateSession('user-1', 'other-workspace'),
    ).rejects.toThrow(AppForbiddenException);
  });
});
