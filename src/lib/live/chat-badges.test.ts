import { describe, expect, it } from 'vitest';
import { parseChatBadges } from './chat-badges';
import { parseHypeTrain } from '@/lib/api/dehub/live-hype';

describe('parseChatBadges', () => {
  it('keeps at most three well-formed badges', () => {
    const raw = [
      { id: 'hype-train', name: 'Hype Train 2', emoji: '🚂', kind: 'hype', level: 2 },
      { id: 'a', name: 'Launch', emoji: '🚀', kind: 'event' },
      { id: 'b', emoji: 5 },
      { id: 'c', name: 'C', emoji: '⭐' },
      { id: 'd', name: 'D', emoji: '💎' },
    ];
    const out = parseChatBadges(raw);
    expect(out.map((b) => b.id)).toEqual(['hype-train', 'a', 'c']);
    expect(out[0]).toEqual({ id: 'hype-train', name: 'Hype Train 2', emoji: '🚂', kind: 'hype', level: 2 });
    expect(out[2].kind).toBe('event');
  });

  it('reads anything else as no badges', () => {
    expect(parseChatBadges(undefined)).toEqual([]);
    expect(parseChatBadges('🚂')).toEqual([]);
  });
});

describe('parseHypeTrain', () => {
  it('reads a train and never divides by zero', () => {
    const t = parseHypeTrain({ streamId: 's', active: true, points: 1500, level: 2, completed: 1, into: 500, need: 0, top: [{ address: '0xAB', points: 9 }] });
    expect(t?.need).toBe(1);
    expect(t?.top[0]).toEqual(expect.objectContaining({ address: '0xab', points: 9 }));
  });

  it('ignores a payload with no stream', () => {
    expect(parseHypeTrain({ points: 3 })).toBeNull();
    expect(parseHypeTrain(null)).toBeNull();
  });
});
