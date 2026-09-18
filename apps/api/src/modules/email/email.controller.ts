import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppValidationException } from '../../common/errors/application.exception';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { SendEmailUseCase } from './application/send-email.use-case';

@Controller('campaign-contacts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class EmailController {
  constructor(private readonly sendEmailUseCase: SendEmailUseCase) {}

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  public async sendEmail(
    @CurrentWorkspace() workspace: { id: string },
    @Param('id') campaignContactId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new AppValidationException(
        'Missing required Idempotency-Key header',
      );
    }

    return this.sendEmailUseCase.execute({
      workspaceId: workspace.id,
      campaignContactId,
      clientKey: idempotencyKey.trim(),
    });
  }
}
