import { describe, expect, it } from 'vitest';
import { isDmCallNotice } from '@/lib/dm-call-notice';

describe('DM call notice classification', () => {
  it.each([
    '📞 Voice call',
    '📹 Video call',
    '📵 Missed voice call',
  ])('recognises a real call notice: %s', (content) => {
    expect(isDmCallNotice(content)).toBe(true);
  });

  it.each([
    '😂😂',
    '😀 hello',
    '🔥',
    'ordinary message',
    '',
  ])('leaves an ordinary message in its normal bubble: %s', (content) => {
    expect(isDmCallNotice(content)).toBe(false);
  });
});
