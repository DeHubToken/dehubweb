/**
 * StageReactions - Floating emoji reactions for live Stages
 * Broadcasts reactions to all participants via Supabase realtime.
 * Also exposes the last reaction per wallet for avatar overlays.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Smile } from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';

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
  x: number;
}

let reactionCounter = 0;

// Map of wallet address → emoji (for avatar overlays)
export type AvatarReactions = Record<string, string>;

interface StageReactionsProps {
  spaceId: string;
  onAvatarReaction?: (reactions: AvatarReactions) => void;
}

export function StageReactions({ spaceId, onAvatarReaction }: StageReactionsProps) {
  const { walletAddress } = useAuth();
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const cooldownRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const avatarReactionsRef = useRef<AvatarReactions>({});
  const avatarTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setAvatarReaction = useCallback((wallet: string, emoji: string) => {
    // Clear existing timeout for this wallet
    if (avatarTimeoutsRef.current[wallet]) {
      clearTimeout(avatarTimeoutsRef.current[wallet]);
    }
    avatarReactionsRef.current = { ...avatarReactionsRef.current, [wallet]: emoji };
    onAvatarReaction?.({ ...avatarReactionsRef.current });

    // Clear after 3 seconds
    avatarTimeoutsRef.current[wallet] = setTimeout(() => {
      const { [wallet]: _, ...rest } = avatarReactionsRef.current;
      avatarReactionsRef.current = rest;
      onAvatarReaction?.({ ...rest });
    }, 3000);
  }, [onAvatarReaction]);

  const spawnFloating = useCallback((emoji: string) => {
    const id = ++reactionCounter;
    const x = Math.random() * 60 - 30;
    setFloating(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloating(prev => prev.filter(r => r.id !== id));
    }, 2000);
  }, []);

  // Subscribe to reactions channel
  useEffect(() => {
    if (!spaceId) return;

    const channel = supabase
      .channel(`stage-reactions:${spaceId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (payload?.emoji) {
          spawnFloating(payload.emoji);
          if (payload.wallet) {
            setAvatarReaction(payload.wallet, payload.emoji);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      // Clear all avatar timeouts
      Object.values(avatarTimeoutsRef.current).forEach(clearTimeout);
    };
  }, [spaceId, spawnFloating, setAvatarReaction]);

  const sendReaction = useCallback((emoji: string) => {
    if (cooldownRef.current) return;

    cooldownRef.current = true;
    setCooldown(true);
    setTimeout(() => {
      cooldownRef.current = false;
      setCooldown(false);
    }, 300);

    // Show locally immediately
    spawnFloating(emoji);
    if (walletAddress) {
      setAvatarReaction(walletAddress, emoji);
    }

    // Broadcast to others via the subscribed channel
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, wallet: walletAddress },
      }).catch(() => {
        // Non-critical
      });
    }
  }, [spawnFloating, walletAddress, setAvatarReaction]);

  return (
    <>
      {/* Floating reactions overlay */}
      <div className="absolute bottom-24 right-4 w-12 pointer-events-none overflow-hidden" style={{ height: 160 }}>
        {floating.map(r => (
          <span
            key={r.id}
            className="absolute bottom-0 text-2xl animate-float-up"
            style={{ left: `calc(50% + ${r.x}%)`, animationDuration: '2s' }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Reactions bento card */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/10">
        <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-2.5">
          <Smile className="w-4 h-4" />
          Reactions
        </h3>
        <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
          {REACTIONS.map(r => (
            <button
              key={r.id}
              onClick={() => sendReaction(r.emoji)}
              disabled={cooldown}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-base",
                "bg-white/[0.07] hover:bg-white/20 active:scale-90 transition-all border border-white/[0.12]",
                "backdrop-blur-sm shadow-sm",
                cooldown && "opacity-40",
              )}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
