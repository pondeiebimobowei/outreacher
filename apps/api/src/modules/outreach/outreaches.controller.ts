import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { CreateOutreachUseCase } from './application/create-outreach.use-case';
import { CreateOutreachDto } from './dto/create-outreach.dto';
import { GetOutreachUseCase } from './application/get-outreach.use-case';
import { UpdateDraftUseCase } from './application/update-draft.use-case';
import { ApproveDraftUseCase } from './application/approve-draft.use-case';
import { GenerateDirectOutreachUseCase } from './application/generate-direct-outreach.use-case';
import { SendOutreachUseCase } from './application/send-outreach.use-case';
import { ResumeOutreachUseCase } from './application/resume-outreach.use-case';

@Controller('outreaches')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutreachesController {
  constructor(
    private readonly createOutreachUseCase: CreateOutreachUseCase,
    private readonly getOutreachUseCase: GetOutreachUseCase,
    private readonly updateDraftUseCase: UpdateDraftUseCase,
    private readonly approveDraftUseCase: ApproveDraftUseCase,
    private readonly generateDirectOutreachUseCase: GenerateDirectOutreachUseCase,
    private readonly sendOutreachUseCase: SendOutreachUseCase,
    private readonly resumeOutreachUseCase: ResumeOutreachUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async createOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateOutreachDto,
  ) {
    return this.createOutreachUseCase.execute(workspace.id, dto, idempotencyKey);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  public async getOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
  ) {
    return this.getOutreachUseCase.execute(workspace.id, outreachId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  public async updateDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
    @Body()
    body: { subject?: string; message?: string; expectedUpdatedAt?: Date },
  ) {
    return this.updateDraftUseCase.execute({
      workspaceId: workspace.id,
      outreachId,
      subject: body.subject,
      message: body.message,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  public async approveDraft(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
    @Body() body?: { expectedUpdatedAt?: Date },
  ) {
    return this.approveDraftUseCase.execute({
      workspaceId: workspace.id,
      outreachId,
      expectedUpdatedAt: body?.expectedUpdatedAt,
    });
  }

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

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  public async sendOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body?: Record<string, unknown>,
  ) {
    return this.sendOutreachUseCase.execute({
      workspaceId: workspace.id,
      outreachId,
      idempotencyKey,
      payload: body,
    });
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  public async resumeOutreach(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') outreachId: string,
  ) {
    return this.resumeOutreachUseCase.execute(workspace.id, outreachId);
  }
}
