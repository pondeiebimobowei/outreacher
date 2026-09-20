import { Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { InboundWebhookService } from './inbound-webhook.service';
import { SkipCsrf } from '../../../common/decorators/skip-csrf.decorator';
import { Public } from '../../auth/decorators/public.decorator';

@Controller('webhooks/email')
export class InboundWebhookController {
  constructor(private readonly webhookService: InboundWebhookService) {}

  @SkipCsrf()
  @Public()
  @Post('inbound/:integrationId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleInbound(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    await this.webhookService.handleInbound(integrationId, req);
    return { accepted: true };
  }
}
