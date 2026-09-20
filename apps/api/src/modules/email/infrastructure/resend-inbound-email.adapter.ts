import { Injectable } from '@nestjs/common';
import { Webhook } from 'svix';
import { InboundEmailProviderAdapter, CanonicalInboundReply, WebhookVerificationContext } from '../domain/inbound-email-provider.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';
import * as crypto from 'crypto';

@Injectable()
export class ResendInboundEmailAdapter extends InboundEmailProviderAdapter {
  verifySignature(context: WebhookVerificationContext): void {
    try {
      const wh = new Webhook(context.secret);
      const headers = context.headers as Record<string, string>;
      wh.verify(context.rawBody.toString('utf8'), headers);
    } catch (err: any) {
      throw new AppValidationException(`Invalid webhook signature: ${err.message}`);
    }
  }

  parsePayload(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): CanonicalInboundReply {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      throw new AppValidationException('Malformed JSON payload');
    }

    const data = payload.data || payload;

    // Resend webhooks via svix always include svix-id header which uniquely identifies the event delivery
    let svixId = headers['svix-id'] as string | undefined;
    if (Array.isArray(svixId)) svixId = svixId[0];

    // Fallback: deterministic hash of the authenticated raw body
    const providerEventId = svixId || crypto.createHash('sha256').update(rawBody).digest('hex');

    const fromField = data.from || '';
    // simple extraction, actual extraction handled in 10C when fetching full email if needed
    const fromEmailMatch = fromField.match(/<([^>]+)>/);
    const fromEmail = fromEmailMatch ? fromEmailMatch[1] : fromField;

    const toArray = Array.isArray(data.to) ? data.to : [data.to];
    const toField = toArray[0] || '';
    const toEmailMatch = toField.match(/<([^>]+)>/);
    const toEmail = toEmailMatch ? toEmailMatch[1] : toField;

    return {
      providerEventId,
      providerEmailId: data.email_id || null,
      messageId: data.message_id || null,
      
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
      receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
    };
  }
}
