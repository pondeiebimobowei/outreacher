import { Injectable } from '@nestjs/common';
import { Webhook } from 'svix';
import { DeliveryEventProviderAdapter, ParseDeliveryEventResult, WebhookVerificationContext } from '../domain/delivery-event-provider.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';
import { EmailEventType } from '@repo/db';

@Injectable()
export class ResendDeliveryEventAdapter extends DeliveryEventProviderAdapter {
  readonly provider = 'RESEND';

  verifySignature(context: WebhookVerificationContext): void {
    const wh = new Webhook(context.secret);
    try {
      wh.verify(context.rawBody.toString('utf8'), context.headers as Record<string, string>);
    } catch (err: any) {
      throw new AppValidationException(`Invalid webhook signature: ${err.message}`);
    }
  }

  parsePayload(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParseDeliveryEventResult {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      return { status: 'INVALID', reason: 'Malformed JSON payload' };
    }

    if (!payload || typeof payload !== 'object') {
      return { status: 'INVALID', reason: 'Payload is not a valid JSON object' };
    }

    // Determine event type
    const type = payload.type as string;
    if (!type) {
      return { status: 'INVALID', reason: 'Missing event type' };
    }

    let eventType: EmailEventType;
    switch (type) {
      case 'email.sent':
        eventType = EmailEventType.SENT;
        break;
      case 'email.delivered':
        eventType = EmailEventType.DELIVERED;
        break;
      case 'email.bounced':
        eventType = EmailEventType.BOUNCED;
        break;
      case 'email.complained':
        eventType = EmailEventType.COMPLAINED;
        break;
      case 'email.delivery_delayed':
        return { status: 'UNSUPPORTED', reason: 'Transient delivery delay' };
      case 'email.opened':
      case 'email.clicked':
        return { status: 'UNSUPPORTED', reason: 'Engagement tracking not supported in delivery flow' };
      default:
        // By default, other non-delivery events are unsupported rather than invalid
        if (type.startsWith('email.')) {
           return { status: 'UNSUPPORTED', reason: `Event type ${type} is not a terminal delivery event` };
        }
        return { status: 'INVALID', reason: `Unknown webhook event type: ${type}` };
    }

    const data = payload.data || payload;
    if (!data || typeof data !== 'object') {
      return { status: 'INVALID', reason: 'Payload data is not a valid object' };
    }

    let svixId = headers['svix-id'] as string | undefined;
    if (Array.isArray(svixId)) svixId = svixId[0];

    if (!svixId) {
      return { status: 'INVALID', reason: 'Missing svix-id header' };
    }
    const providerEventId = svixId;

    if (!data.email_id) return { status: 'INVALID', reason: 'Missing email_id (providerMessageId) in payload' };

    const toField = data.to;
    let toEmail = '';
    if (Array.isArray(toField) && toField.length > 0) {
      toEmail = toField[0];
    } else if (typeof toField === 'string') {
      toEmail = toField;
    } else {
      return { status: 'INVALID', reason: 'Missing recipient in payload' };
    }

    const toEmailMatch = toEmail.match(/<([^>]+)>/);
    const recipientEmail = toEmailMatch ? toEmailMatch[1] : toEmail;

    const occurredAt = (() => {
      if (!data.created_at) return new Date();
      const d = new Date(data.created_at);
      if (isNaN(d.getTime())) return new Date();
      return d;
    })();

    return {
      status: 'VALID',
      event: {
        providerEventId,
        providerMessageId: data.email_id,
        recipientEmail,
        eventType,
        occurredAt,
        rawPayload: payload as Record<string, unknown>,
      }
    };
  }
}
