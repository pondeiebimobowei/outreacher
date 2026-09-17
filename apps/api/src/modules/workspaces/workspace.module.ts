import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceGuard } from './workspace.guard';
import { WorkspaceService } from './workspace.service';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceGuard],
  exports: [WorkspaceService, WorkspaceGuard],
})
export class WorkspaceModule {}
