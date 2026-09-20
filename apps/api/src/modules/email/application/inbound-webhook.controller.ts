import { Controller, HttpCode, HttpStatus, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { InboundWebhookService } from './inbound-webhook.service';

@Controller('webhooks/email')
export class InboundWebhookController {
  constructor(private readonly webhookService: InboundWebhookService) {}

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
