import { MessageIdGenerator } from './message-id.generator';

describe('MessageIdGenerator', () => {
  it('generates a valid RFC 5322 Message-ID with default domain', () => {
    const messageId = MessageIdGenerator.generate();

    expect(messageId).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@mail\.outreacher\.local>$/,
    );
  });

  it('extracts domain from fromEmail and formats Message-ID', () => {
    const messageId = MessageIdGenerator.generate('Outreach <sender@acme.com>');

    expect(messageId).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@acme\.com>>?$/,
    );
  });

  it('uses domain directly if supplied without @', () => {
    const messageId = MessageIdGenerator.generate('example.org');

    expect(messageId).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example\.org>$/,
    );
  });

  it('generates unique message IDs on consecutive calls', () => {
    const id1 = MessageIdGenerator.generate('domain.com');
    const id2 = MessageIdGenerator.generate('domain.com');

    expect(id1).not.toBe(id2);
  });
});
