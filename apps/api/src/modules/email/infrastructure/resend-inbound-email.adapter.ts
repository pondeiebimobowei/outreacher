import { Injectable } from '@nestjs/common';
import { Webhook } from 'svix';
import { InboundEmailProviderAdapter, CanonicalInboundReply, WebhookVerificationContext } from '../domain/inbound-email-provider.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';

@Injectable()
export class ResendInboundEmailAdapter extends InboundEmailProviderAdapter {
  verifySignature(context: WebhookVerificationContext): void {
    const wh = new Webhook(context.secret);
    try {
      wh.verify(context.rawBody.toString('utf8'), context.headers);
    } catch (err: any) {
      throw new AppValidationException(`Invalid webhook signature: ${err.message}`);
    }
  }

  parsePayload(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): CanonicalInboundReply {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      throw new AppValidationException('Malformed JSON payload');
    }

    if (!payload || typeof payload !== 'object') {
      throw new AppValidationException('Payload is not a valid JSON object');
    }

    if (payload.type !== 'email.received') {
      throw new AppValidationException(`Unsupported webhook event type: ${payload.type}`);
    }

    const data = payload.data || payload;
    if (!data || typeof data !== 'object') {
      throw new AppValidationException('Payload data is not a valid object');
    }

    let svixId = headers['svix-id'] as string | undefined;
    if (Array.isArray(svixId)) svixId = svixId[0];

    if (!svixId) {
      throw new AppValidationException('Missing svix-id header');
    }
    const providerEventId = svixId;

    if (!data.email_id) throw new AppValidationException('Missing email_id in payload');
    if (!data.message_id) throw new AppValidationException('Missing message_id in payload');
    if (!data.from) throw new AppValidationException('Missing from address in payload');

    const fromField = data.from;
    const fromEmailMatch = fromField.match(/<([^>]+)>/);
    const fromEmail = fromEmailMatch ? fromEmailMatch[1] : fromField;

    const toArray = Array.isArray(data.to) ? data.to : [data.to];
    const toField = toArray[0];
    if (!toField) throw new AppValidationException('Missing recipient in payload');
    
    const toEmailMatch = toField.match(/<([^>]+)>/);
    const toEmail = toEmailMatch ? toEmailMatch[1] : toField;

    return {
      providerEventId,
      providerEmailId: data.email_id,
      messageId: data.message_id,
      
      // These are not in the Resend webhook payload, must be fetched via Receiving API in 10C
      inReplyTo: null,
      references: [],
      replyToToken: null,
      fromName: null, 
      fromEmail: fromEmail,
      toEmail: toEmail,
      subject: data.subject || null,
      bodyText: null, 
      bodyHtml: null, 
      receivedAt: (() => {
        if (!data.created_at) return new Date();
        const d = new Date(data.created_at);
        if (isNaN(d.getTime())) throw new AppValidationException('Invalid created_at timestamp');
        return d;
      })(),
    };
  }
}
