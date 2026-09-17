import { describe, it, expect } from 'vitest';
import { mergeIncoming, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';

/**
 * The fast append path a busy stream's chat leans on. The point of these is
 * that skipping the full dedupe+sort must not change what ends up on screen.
 */
function msg(
  id: string,
  content: string,
  seconds: number,
  sender = '0xabc',
): SupabaseLiveChatMessage {
  return {
    id,
    room_id: 'room',
    sender_address: sender,
    sender_username: null,
    sender_display_name: null,
    sender_avatar_url: null,
    content,
    message_type: 'text',
    image_url: null,
    is_pinned: false,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString(),
  };
}

describe('mergeIncoming', () => {
  it('returns the same array when nothing arrived', () => {
    const prev = [msg('a', 'one', 1)];
    expect(mergeIncoming(prev, [])).toBe(prev);
  });

  it('appends a burst in the order it was sent', () => {
    const prev = [msg('a', 'one', 1)];
    const out = mergeIncoming(prev, [msg('b', 'two', 2), msg('c', 'three', 3)]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces a row the batch carries a newer version of', () => {
    const prev = [msg('a', 'one', 1), msg('b', 'two', 2)];
    const out = mergeIncoming(prev, [msg('b', 'two edited', 2)]);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.id === 'b')?.content).toBe('two edited');
  });

  it('evicts the optimistic row its confirmation matches', () => {
    // The gateway assigns the real id and never sees the temp- one, so the
    // match has to be on sender plus content.
    const prev = [msg('temp-1', 'hello', 1, '0xme')];
    const out = mergeIncoming(prev, [msg('real-1', 'hello', 1, '0xme')]);
    expect(out.map((m) => m.id)).toEqual(['real-1']);
  });

  it('keeps an optimistic row a different sender happened to duplicate', () => {
    const prev = [msg('temp-1', 'gm', 1, '0xme')];
    const out = mergeIncoming(prev, [msg('real-1', 'gm', 1, '0xsomeoneelse')]);
    expect(out.map((m) => m.id).sort()).toEqual(['real-1', 'temp-1']);
  });

  it('sorts when a batch actually lands out of order', () => {
    // A reconnect replaying history is the case that still has to pay for it.
    const prev = [msg('c', 'three', 3)];
    const out = mergeIncoming(prev, [msg('a', 'one', 1), msg('b', 'two', 2)]);
    expect(out.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('caps the retained history', () => {
    const prev = Array.from({ length: 300 }, (_, i) => msg(`p${i}`, `m${i}`, i));
    const out = mergeIncoming(prev, [msg('new', 'newest', 400)]);
    expect(out).toHaveLength(300);
    expect(out[out.length - 1].id).toBe('new');
    expect(out.find((m) => m.id === 'p0')).toBeUndefined();
  });

  it('keeps pinned messages that fall off the end of the cap', () => {
    const prev = Array.from({ length: 300 }, (_, i) => ({
      ...msg(`p${i}`, `m${i}`, i),
      is_pinned: i === 0,
    }));
    const out = mergeIncoming(prev, [msg('new', 'newest', 400)]);
    expect(out.find((m) => m.id === 'p0')).toBeDefined();
  });
});
