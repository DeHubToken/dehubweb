/**
 * StageReactions - Floating emoji reactions for live Stages
 * Listeners (and speakers) can tap reactions that float up and fade out
 */

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

const REACTIONS = [
  { id: 'thumbsup', emoji: '👍' },
  { id: 'thumbsdown', emoji: '👎' },
  { id: 'fire', emoji: '🔥' },
  { id: 'poop', emoji: '💩' },
  { id: 'rocket', emoji: '🚀' },
  { id: 'party', emoji: '🎉' },
  { id: 'cold', emoji: '🥶' },
  { id: 'heart', emoji: '❤️' },
  { id: 'clap', emoji: '👏' },
];

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number; // percentage offset from center
}

let reactionCounter = 0;

interface StageReactionsProps {
  spaceId: string;
}

export function StageReactions({ spaceId }: StageReactionsProps) {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const cooldownRef = useRef(false);

  const sendReaction = useCallback((emoji: string) => {
    if (cooldownRef.current) return;
    
    // Brief cooldown to prevent spam
    cooldownRef.current = true;
    setCooldown(true);
    setTimeout(() => {
      cooldownRef.current = false;
      setCooldown(false);
    }, 300);

    const id = ++reactionCounter;
    const x = Math.random() * 60 - 30; // -30% to +30% offset

    setFloating(prev => [...prev, { id, emoji, x }]);

    // Remove after animation completes
    setTimeout(() => {
      setFloating(prev => prev.filter(r => r.id !== id));
    }, 2000);
  }, []);

  return (
    <>
      {/* Floating reactions overlay */}
      <div className="absolute bottom-24 right-4 w-12 pointer-events-none overflow-hidden" style={{ height: 160 }}>
        {floating.map(r => (
          <span
            key={r.id}
            className="absolute bottom-0 text-2xl animate-float-up"
            style={{
              left: `calc(50% + ${r.x}%)`,
              animationDuration: '2s',
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Reaction bar */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {REACTIONS.map(r => (
          <button
            key={r.id}
            onClick={() => sendReaction(r.emoji)}
            disabled={cooldown}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-lg",
              "bg-white/5 hover:bg-white/15 active:scale-90 transition-all border border-white/10",
              cooldown && "opacity-50"
            )}
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </>
  );
}
