import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  AppNotFoundException,
  AppUnauthorizedException,
} from '../../common/errors/application.exception';
import { WorkspaceService } from './workspace.service';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;
    const workspace = request.workspace;

    if (!user) {
      throw new AppUnauthorizedException(
        'Authentication required to resolve workspace context.',
      );
    }

    if (!workspace) {
      throw new AppNotFoundException('Workspace context not found for user.');
    }

    // Check if route includes explicit workspaceId param or query or header
    const explicitWorkspaceId =
      (request.params && request.params.workspaceId) ||
      (request.query && (request.query.workspaceId as string)) ||
      request.headers['x-workspace-id'];

    if (explicitWorkspaceId && explicitWorkspaceId !== workspace.id) {
      // Validate if user has access to explicit workspace ID
      await this.workspaceService.validateUserWorkspaceAccess(
        user.id,
        explicitWorkspaceId as string,
      );
    }

    return true;
  }
}
