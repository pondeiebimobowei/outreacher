import { ResendInboundContentAdapter, InboundRetrievalException } from './resend-inbound-content.adapter';
import { Resend } from 'resend';

jest.mock('resend');

describe('ResendInboundContentAdapter', () => {
  let adapter: ResendInboundContentAdapter;
  let getMock: any;

  beforeEach(() => {
    adapter = new ResendInboundContentAdapter();
    getMock = jest.fn();
    (Resend as jest.Mock).mockImplementation(() => ({
      get: getMock
    }));
  
  it('handles AbortError/Timeout as TIMEOUT', async () => {
    getMock.mockRejectedValue(new Error('The user aborted a request.')); // Resend fetch wrapper behavior

    await expect(adapter.getEmailDetails('email-1', { apiKey: 'key' })).rejects.toMatchObject({
      retrievalCode: 'TIMEOUT',
      isRetryable: true
    });
  });

});

  it('maps successful response', async () => {
    getMock.mockResolvedValue({
      data: {
        id: 'email-1',
        message_id: 'msg-1',
        text: 'Hello',
        html: '<p>Hello</p>',
        headers: {
          'In-Reply-To': 'in-reply',
          'References': ['ref1', 'ref2']
        }
      },
      error: null
    });

    const result = await adapter.getEmailDetails('email-1', { apiKey: 'key' });
    expect(result).toEqual({
      providerEmailId: 'email-1',
      messageId: 'msg-1',
      text: 'Hello',
      html: '<p>Hello</p>',
      inReplyTo: 'in-reply',
      references: ['ref1', 'ref2']
    });
  });

  it('handles 404 as terminal error', async () => {
    getMock.mockResolvedValue({
      data: null,
      error: { statusCode: 404, message: 'Not found' }
    });

    await expect(adapter.getEmailDetails('email-1', { apiKey: 'key' })).rejects.toMatchObject({
      retrievalCode: 'NOT_FOUND',
      isRetryable: false
    });
  });

  it('handles 500 as retryable error', async () => {
    getMock.mockResolvedValue({
      data: null,
      error: { statusCode: 500, message: 'Server error' }
    });

    await expect(adapter.getEmailDetails('email-1', { apiKey: 'key' })).rejects.toMatchObject({
      retrievalCode: 'PROVIDER_ERROR',
      isRetryable: true
    });
  });

  it('handles null statusCode as connectivity error', async () => {
    getMock.mockResolvedValue({
      data: null,
      error: { statusCode: null, message: 'Network failed' }
    });

    await expect(adapter.getEmailDetails('email-1', { apiKey: 'key' })).rejects.toMatchObject({
      retrievalCode: 'CONNECTIVITY_ERROR',
      isRetryable: true
    });
  });
});
