import { Injectable } from '@nestjs/common';
import { Webhook } from 'svix';
import { InboundEmailProviderAdapter, CanonicalInboundReply, WebhookVerificationContext } from '../domain/inbound-email-provider.adapter';
import { AppValidationException } from '../../../common/errors/application.exception';

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

  parsePayload(rawBody: Buffer): CanonicalInboundReply {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
      throw new AppValidationException('Malformed JSON payload');
    }

    // Usually wrapped in { type: '...', data: { ... } } for Resend webhooks
    const data = payload.data || payload;

    // Resend specific headers mapping
    // They usually provide an array of headers or object
    let messageId = null;
    let inReplyTo = null;
    let references: string[] = [];

    // Assuming data.headers is an array of {name, value} or similar in Resend's payload,
    // or we might need to rely on data.message_id / data.in_reply_to if they are top-level
    if (data.headers && Array.isArray(data.headers)) {
      data.headers.forEach((h: any) => {
        const name = h.name.toLowerCase();
        if (name === 'message-id') messageId = h.value;
        if (name === 'in-reply-to') inReplyTo = h.value;
        if (name === 'references') {
          references = h.value.split(/\s+/).filter(Boolean);
        }
      });
    }

    return {
      providerMessageId: data.id || null,
      messageId: messageId || data.messageId || null,
      inReplyTo: inReplyTo || data.inReplyTo || null,
      references: references,
      replyToToken: null, // Extracted later in correlation engine from the TO address or references
      fromName: data.from?.name || null,
      fromEmail: data.from?.email || data.from || '',
      toEmail: data.to?.[0]?.email || data.to?.[0] || '',
      subject: data.subject || null,
      bodyText: data.text || null,
      bodyHtml: data.html || null,
      receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
    };
  }
}
