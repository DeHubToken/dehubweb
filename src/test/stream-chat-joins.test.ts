import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/api/dehub/livestream', () => ({ getStreamActivities: vi.fn() }));
vi.mock('@/lib/api/dehub/stream-presence', () => ({ watchStreamJoins: vi.fn(), watchStreamGifts: vi.fn() }));
import { uniqueStreamJoins } from '@/hooks/use-stream-chat-joins';
import type { StreamActivity } from '@/lib/api/dehub/livestream';

const arrival = (id: string, address: string, seconds: number): StreamActivity => ({
  id, address, type: 'join', timestamp: new Date(seconds * 1000).toISOString(),
});

describe('stream chat arrivals', () => {
  it('collapses history, socket echoes and reconnects into the first arrival', () => {
    expect(uniqueStreamJoins([
      arrival('old', '0xABC', 1), arrival('other', '0xDEF', 2),
      arrival('echo', '0xabc', 1), arrival('reconnected', '0xabc', 80),
    ]).map(a => a.id)).toEqual(['old', 'other']);
  });
  it('keeps a reconnect above what the viewer did after arriving', () => {
    const joins = uniqueStreamJoins([arrival('first', '0xabc', 1), arrival('reconnected', '0xabc', 80)]);
    expect(joins.map(a => a.id)).toEqual(['first']);
    expect(Date.parse(joins[0].timestamp)).toBeLessThan(40 * 1000);
  });
  it('never collapses gifts, even from a viewer who also joined', () => {
    const gift = { ...arrival('tip', '0xabc', 30), type: 'gift' as const, giftAmount: 10 };
    expect(uniqueStreamJoins([arrival('first', '0xabc', 1), gift, arrival('again', '0xabc', 60)]).map(a => a.id))
      .toEqual(['first', 'tip']);
  });
  it('does not confuse two anonymous viewers', () => {
    expect(uniqueStreamJoins([arrival('one', '', 1), arrival('two', '', 2)])).toHaveLength(2);
  });
});
