import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { InboundEmailContentAdapter, InboundEmailDetails } from '../domain/inbound-email-content.adapter';
import { ResendCredentials } from '../domain/provider-credentials';
import { AppValidationException, AppException } from '../../../common/errors/application.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';

export enum InboundRetrievalErrorCode {
  CREDENTIAL_ERROR = 'CREDENTIAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONNECTIVITY_ERROR = 'CONNECTIVITY_ERROR',
  TIMEOUT = 'TIMEOUT',
}

export class InboundRetrievalException extends AppException {
  constructor(message: string, public readonly retrievalCode: InboundRetrievalErrorCode, public readonly isRetryable: boolean, statusCode: number = HttpStatus.BAD_GATEWAY) {
    super(message, statusCode, ErrorCode.PROVIDER_FAILURE, { code: retrievalCode, isRetryable });
  }
}

@Injectable()
export class ResendInboundContentAdapter implements InboundEmailContentAdapter<ResendCredentials> {
  private readonly logger = new Logger(ResendInboundContentAdapter.name);
  private readonly TIMEOUT_MS = 15000;

  async getEmailDetails(providerEmailId: string, credentials: ResendCredentials): Promise<InboundEmailDetails> {
    if (!credentials || !credentials.apiKey) {
      throw new InboundRetrievalException('Missing Resend credentials', InboundRetrievalErrorCode.CREDENTIAL_ERROR, false, HttpStatus.UNAUTHORIZED);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const resend = new Resend(credentials.apiKey);

      // We use the official SDK transport `get` against the canonical receiving endpoint 
      // rather than `resend.emails.receiving.get` which does not support AbortSignal.
      const path = `/emails/receiving/${providerEmailId}`;
      const { data, error } = await resend.get(path, { signal: controller.signal } as any);

      if (error) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          throw new InboundRetrievalException(`Provider authentication failed: ${error.message}`, InboundRetrievalErrorCode.CREDENTIAL_ERROR, false, error.statusCode);
        }
        if (error.statusCode === 404) {
          throw new InboundRetrievalException(`Email not found: ${error.message}`, InboundRetrievalErrorCode.NOT_FOUND, false, error.statusCode);
        }
        if (error.statusCode && error.statusCode >= 500) {
          throw new InboundRetrievalException(`Provider temporary error: ${error.message}`, InboundRetrievalErrorCode.PROVIDER_ERROR, true, error.statusCode);
        }
        if (error.statusCode === null || !error.statusCode) {
          throw new InboundRetrievalException(`Network/Connectivity error: ${error.message}`, InboundRetrievalErrorCode.CONNECTIVITY_ERROR, true);
        }
        // Fallback for other errors
        throw new InboundRetrievalException(`Provider error: ${error.message}`, InboundRetrievalErrorCode.PROVIDER_ERROR, true, error.statusCode || HttpStatus.BAD_GATEWAY);
      }

      if (!data) {
         throw new InboundRetrievalException('Provider returned empty response', InboundRetrievalErrorCode.PROVIDER_ERROR, true);
      }

      const rawHeaders = (data as any).headers || {};
      const headers = Object.keys(rawHeaders).reduce((acc, key) => {
        acc[key.toLowerCase()] = rawHeaders[key];
        return acc;
      }, {} as Record<string, any>);
      const inReplyTo = headers['in-reply-to'] || null;
      
      let references: string[] = [];
      const refHeader = headers['references'];
      if (typeof refHeader === 'string') {
        references = refHeader.split(/\s+/).filter(r => r.length > 0);
      } else if (Array.isArray(refHeader)) {
        references = refHeader;
      }

      return {
        providerEmailId: (data as any).id,
        messageId: (data as any).message_id || null,
        inReplyTo,
        references,
        text: (data as any).text || null,
        html: (data as any).html || null,
      };

    } catch (err: any) {
      if (err instanceof InboundRetrievalException) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new InboundRetrievalException('Provider request timed out', InboundRetrievalErrorCode.TIMEOUT, true);
      }
      throw new InboundRetrievalException(`Unknown error retrieving email: ${err.message}`, InboundRetrievalErrorCode.PROVIDER_ERROR, true);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
