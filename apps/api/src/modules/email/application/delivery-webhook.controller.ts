import { Controller, Post, Param, Req, Res, HttpCode } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { DeliveryWebhookService } from './delivery-webhook.service';

@Controller('webhooks/email/delivery')
export class DeliveryWebhookController {
  constructor(private readonly webhookService: DeliveryWebhookService) {}

  @Post(':integrationId')
  @HttpCode(202)
  async handleDeliveryWebhook(
    @Param('integrationId') integrationId: string,
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.webhookService.handleDelivery(integrationId, req);
    res.status(202).send({ accepted: true });
  }
}
