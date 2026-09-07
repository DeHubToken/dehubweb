import { describe, expect, it } from 'vitest';
import { QUICK_CHAT_REACTIONS } from '@/components/app/chat/reaction-options';

describe('chat reaction options', () => {
  it('includes salute exactly once in the shared chat and DM picker', () => {
    expect(QUICK_CHAT_REACTIONS.filter(emoji => emoji === '🫡')).toHaveLength(1);
  });
});
