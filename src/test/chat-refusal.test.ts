import { describe, expect, it } from 'vitest';
import { chatRefusalText, formatChatWait, ShownChatError, wasShownToUser } from '@/lib/chat-refusal';

describe('chat refusal text', () => {
  it('says slow down with the wait for the anti-flood refusal', () => {
    const text = chatRefusalText({ code: 'SLOW_DOWN', retryAfterSeconds: 400, message: 'server text' });
    expect(text).toMatch(/Slow down/);
    expect(text).toMatch(/7 min/);
  });

  it('uses the server reason for everything else', () => {
    expect(chatRefusalText({ code: 'AUTOMOD', message: 'That message looks like a scam, so it was not sent.' }))
      .toBe('That message looks like a scam, so it was not sent.');
    expect(chatRefusalText(undefined)).toBe('Message was not sent');
  });

  it('formats waits', () => {
    expect(formatChatWait(30)).toBe('30s');
    expect(formatChatWait(61)).toBe('2 min');
  });

  it('marks errors already shown', () => {
    expect(wasShownToUser(new ShownChatError('x'))).toBe(true);
    expect(wasShownToUser(new Error('x'))).toBe(false);
  });
});
