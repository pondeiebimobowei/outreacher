import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { GenerateDirectOutreachUseCase } from './application/generate-direct-outreach.use-case';
import { UpdateDirectOutreachUseCase } from './application/update-direct-outreach.use-case';
import { SendDirectOutreachUseCase } from './application/send-direct-outreach.use-case';

@Controller('outreaches')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutreachesController {
  constructor(
    private readonly generateDirectOutreachUseCase: GenerateDirectOutreachUseCase,
    private readonly updateDirectOutreachUseCase: UpdateDirectOutreachUseCase,
    private readonly sendDirectOutreachUseCase: SendDirectOutreachUseCase,
  ) {}

  @Post(':id/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  public async generateOutreach(
    @CurrentUser() user: { id: string },
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
  ) {
    return this.generateDirectOutreachUseCase.execute({
      userId: user.id,
      workspaceId: workspace.id,
      outreachId,
    });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  public async updateDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
    @Body() body: { subject?: string; message?: string; expectedUpdatedAt?: Date },
  ) {
    return this.updateDirectOutreachUseCase.execute({
      workspaceId: workspace.id,
      outreachId,
      subject: body.subject,
      message: body.message,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  public async sendOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
    @Body() body?: { idempotencyKey?: string },
  ) {
    return this.sendDirectOutreachUseCase.execute({
      workspaceId: workspace.id,
      outreachId,
      idempotencyKey: body?.idempotencyKey,
    });
  }
}
