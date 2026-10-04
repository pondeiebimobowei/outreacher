import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { RecordUserOutcomeUseCase } from './application/record-user-outcome.use-case';
import { RecordOutcomeDto } from './dto/record-outcome.dto';

@Controller()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class OutcomeController {
  constructor(private readonly recordUserOutcome: RecordUserOutcomeUseCase) {}

  @Post('outreaches/:id/outcome')
  async recordOutcome(
    @Param('id') outreachId: string,
    @Body() dto: RecordOutcomeDto,
    @CurrentUser() user: { id: string },
    @CurrentWorkspace() workspace: { id: string },
  ) {
    const outcomeId = await this.recordUserOutcome.execute(
      outreachId,
      workspace.id,
      user.id,
      dto.outcomeType,
      dto.notes,
    );

    return { id: outcomeId };
  }
}
