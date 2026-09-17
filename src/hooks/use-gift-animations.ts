/**
 * The queue behind the gift celebrations on a live card.
 *
 * Holds at most two at a time and drops each one when its tier's duration is
 * up. Two rather than one because a busy stream gets gifts faster than a
 * 10-second Golden Screen can finish, and cutting the expensive celebration
 * short to show a 1,000 DHB heart is exactly the wrong way round — the newest
 * plays on top instead, and the older one still runs out its time underneath.
 *
 * Every timer is cleared on unmount: a live card that scrolls out of the feed
 * while a gift is playing would otherwise setState on a dead component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tierFromGift } from '@/lib/live/gift-tiers';
import type { GiftCelebration } from '@/components/app/live/GiftAnimationOverlay';

export interface IncomingGift {
  amount?: number | string;
  selectedTier?: string;
  username?: string;
  message?: string;
}

const MAX_CONCURRENT = 2;

export function useGiftAnimations() {
  const [items, setItems] = useState<GiftCelebration[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    [],
  );

  const enqueue = useCallback((gift: IncomingGift) => {
    const amount = Number(gift.amount) || 0;
    if (amount <= 0) return;
    const tier = tierFromGift(gift);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: GiftCelebration = {
      id,
      tier,
      amount,
      username: gift.username,
      message: gift.message,
    };

    setItems((prev) => {
      const next = [...prev, item];
      // Drop the oldest beyond the cap, and stop its timer with it.
      while (next.length > MAX_CONCURRENT) {
        const dropped = next.shift();
        if (dropped) {
          const t = timers.current.get(dropped.id);
          if (t) clearTimeout(t);
          timers.current.delete(dropped.id);
        }
      }
      return next;
    });

    const timer = setTimeout(() => {
      timers.current.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, tier.durationMs + 250);
    timers.current.set(id, timer);
  }, []);

  return { items, enqueue };
}
