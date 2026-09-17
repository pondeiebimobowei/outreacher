import { Injectable } from '@nestjs/common';
import {
  AppForbiddenException,
  AppNotFoundException,
} from '../../common/errors/application.exception';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the current workspace for an authenticated user.
   * For MVP, every user has exactly one personal workspace (where they are OWNER or MEMBER).
   */
  async getWorkspaceForUser(userId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!member || !member.workspace) {
      throw new AppNotFoundException('Workspace not found for user');
    }

    return member.workspace;
  }

  /**
   * Verifies that the specified user has access to the target workspace.
   * Throws AppForbiddenException if authorization fails.
   */
  async validateUserWorkspaceAccess(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new AppForbiddenException('Access to workspace denied');
    }

    return true;
  }
}
