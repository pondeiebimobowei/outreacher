import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { type RequestWorkspace } from '../../types/express';
import { CurrentWorkspace } from './decorators/current-workspace.decorator';
import { WorkspaceGuard } from './workspace.guard';

@Controller('workspaces')
@UseGuards(WorkspaceGuard)
export class WorkspaceController {
  @Get('current')
  @HttpCode(HttpStatus.OK)
  getCurrentWorkspace(@CurrentWorkspace() workspace: RequestWorkspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.ownerId,
    };
  }
}
