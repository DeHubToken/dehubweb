import { Link, useLocation } from 'react-router-dom';
import { Flame, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { useRef, useEffect, useCallback } from 'react';
import type { LaunchpadToken } from '@/hooks/use-launchpad-tokens';

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function CoinCard({
  t,
  i,
  base,
}: {
  t: LaunchpadToken | undefined;
  i: number;
  base: string;
}) {
  return (
    <Link
      to={t ? `${base}/${t.id}` : '#'}
      className={`group flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 px-2.5 py-1.5 transition-colors shrink-0 ${t ? '' : 'pointer-events-none opacity-60'}`}
    >
      <span className="text-white/40 text-[10px] font-bold tabular-nums w-4">#{i + 1}</span>
      <div className="h-7 w-7 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0">
        {t?.image_url ? (
          <img
            src={t.image_url}
            alt={t.symbol}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/40 text-[10px] font-bold">
            —
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-white text-xs font-semibold leading-tight">
          {t ? `$${t.symbol}` : '—'}
        </span>
        <span className="text-white/50 text-[10px] tabular-nums flex items-center gap-1 leading-tight">
          <TrendingUp className="h-2.5 w-2.5" />
          {t ? fmtUsd(t.volume_24h) : '—'}
        </span>
      </div>
    </Link>
  );
}

export function TrendingBar() {
  const base = getLaunchpadBase(useLocation().pathname);
  const trackRef = useRef<HTMLDivElement>(null);
  const isPaused = useRef(false);
  const touchStartX = useRef(0);

  const { data: tokens = [] } = useQuery({
    queryKey: ['launchpad-trending-bar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('launchpad_tokens')
        .select('*')
        .order('volume_24h', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as LaunchpadToken[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const pause = useCallback(() => {
    isPaused.current = true;
    if (trackRef.current) {
      trackRef.current.style.animationPlayState = 'paused';
    }
  }, []);

  const resume = useCallback(() => {
    // Resume only if not manually scrolling (we leave paused after touch)
    if (!trackRef.current) return;
    // If user isn't touching, resume
    trackRef.current.style.animationPlayState = 'running';
    isPaused.current = false;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      pause();
    };

    const onTouchEnd = () => {
      // Resume after a short delay to avoid snapping back while momentum scrolls
      setTimeout(() => resume(), 500);
    };

    track.addEventListener('touchstart', onTouchStart, { passive: true });
    track.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      track.removeEventListener('touchstart', onTouchStart);
      track.removeEventListener('touchend', onTouchEnd);
    };
  }, [pause, resume]);

  const items = Array.from({ length: 20 }, (_, i) => tokens[i]);
  // Duplicate for seamless loop
  const allItems = [...items, ...items];

  return (
    <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Flame className="h-3.5 w-3.5 text-white/80" />
        <span className="text-white text-xs font-semibold uppercase tracking-wide">
          Trending
        </span>
        <span className="text-white/40 text-[10px]">
          Top 20 · Volume & community activity
        </span>
      </div>
      <div
        className="overflow-hidden relative"
        onMouseEnter={pause}
        onMouseLeave={resume}
      >
        <div
          ref={trackRef}
          className="flex gap-2 p-2 trending-marquee"
          style={{
            width: 'max-content',
            willChange: 'transform',
          }}
        >
          {allItems.map((t, i) => (
            <CoinCard key={i} t={t} i={i % 20} base={base} />
          ))}
        </div>
      </div>
    </div>
  );
}

