import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/api/dehub/livestream', () => ({ getStreamActivities: vi.fn() }));
vi.mock('@/lib/api/dehub/stream-presence', () => ({ watchStreamJoins: vi.fn() }));
import { uniqueStreamJoins } from '@/hooks/use-stream-chat-joins';
import type { StreamActivity } from '@/lib/api/dehub/livestream';

const arrival = (id: string, address: string, seconds: number): StreamActivity => ({
  id, address, type: 'join', timestamp: new Date(seconds * 1000).toISOString(),
});

describe('stream chat arrivals', () => {
  it('collapses history, socket echoes and reconnects into the latest arrival', () => {
    expect(uniqueStreamJoins([
      arrival('old', '0xABC', 1), arrival('other', '0xDEF', 2),
      arrival('echo', '0xabc', 1), arrival('reconnected', '0xabc', 80),
    ]).map(a => a.id)).toEqual(['other', 'reconnected']);
  });
  it('does not confuse two anonymous viewers', () => {
    expect(uniqueStreamJoins([arrival('one', '', 1), arrival('two', '', 2)])).toHaveLength(2);
  });
});
