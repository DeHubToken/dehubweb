/**
 * Gift celebrations over a live stream
 * ====================================
 * Plays the tier a gift bought: floating emoji up the bottom-right corner on
 * every gift, plus a custom effect per tier on top of it.
 *
 * Built from absolutely-positioned elements driven by CSS keyframes rather
 * than framer-motion. A Golden Screen is ~40 coins and an Ultimate is ~90
 * particles at once, all of them on top of a playing video — springing those
 * through React would run the whole lot on the main thread next to HLS
 * decoding. Keyframes on `transform`/`opacity` stay on the compositor, and the
 * particle count is the only thing that grows with the tier.
 *
 * Everything here is decoration: the host element is `pointer-events-none` end
 * to end, so a celebration can never eat a tap on the player underneath, and
 * the whole overlay is skipped for viewers who asked for reduced motion.
 */
import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { GiftTier } from '@/lib/live/gift-tiers';

export interface GiftCelebration {
  id: string;
  tier: GiftTier;
  amount: number;
  /** Who sent it — a username when we have one, never a raw address. */
  username?: string;
  message?: string;
}

/**
 * Deterministic pseudo-random from a particle's index.
 *
 * Math.random() during render would hand every particle a new position on each
 * re-parent, restarting animations mid-flight when a second gift arrives.
 */
const jitter = (seed: number, salt: number) => {
  const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** One stylesheet for every card on the page, injected on first celebration. */
const STYLE_ID = 'dehub-gift-fx';
const KEYFRAMES = `
@keyframes dehub-gift-float {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(0.4) rotate(0deg); }
  12%  { opacity: 1; transform: translate3d(0, -12%, 0) scale(1) rotate(-6deg); }
  70%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--gift-drift), -100%, 0) scale(1.15) rotate(var(--gift-spin)); }
}
@keyframes dehub-gift-fall {
  0%   { opacity: 0; transform: translate3d(0, -20%, 0) rotate(0deg); }
  10%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--gift-drift), 105vh, 0) rotate(var(--gift-spin)); }
}
@keyframes dehub-gift-burst {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(0.2); }
  20%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--gift-dx), var(--gift-dy), 0) scale(1.1) rotate(var(--gift-spin)); }
}
@keyframes dehub-gift-pop {
  0%   { opacity: 0; transform: scale(0.3) translateY(30%); }
  22%  { opacity: 1; transform: scale(1.12) translateY(0); }
  34%  { transform: scale(0.96) translateY(0); }
  46%  { transform: scale(1.04) translateY(0); }
  78%  { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(0.9) translateY(-24%); }
}
@keyframes dehub-gift-ring {
  0%   { opacity: 0.85; transform: scale(0.2); }
  100% { opacity: 0; transform: scale(2.6); }
}
@keyframes dehub-gift-wash {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes dehub-gift-siren {
  0%, 100% { opacity: 0.25; }
  50%      { opacity: 0.75; }
}
@keyframes dehub-gift-march {
  0%   { opacity: 0; transform: translate3d(-30%, 0, 0); }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(130%, 0, 0); }
}
@keyframes dehub-gift-step {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50%      { transform: translateY(-14%) rotate(4deg); }
}
@keyframes dehub-gift-swing {
  0%   { opacity: 0; transform: translateY(-120%) rotate(-18deg); }
  15%  { opacity: 1; transform: translateY(0) rotate(-18deg); }
  45%  { transform: translateY(0) rotate(18deg); }
  75%  { transform: translateY(0) rotate(-12deg); }
  100% { opacity: 0; transform: translateY(-120%) rotate(0deg); }
}
@keyframes dehub-gift-banner {
  0%   { opacity: 0; transform: translateY(40%); }
  14%  { opacity: 1; transform: translateY(0); }
  86%  { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40%); }
}
@keyframes dehub-gift-glint {
  0%   { opacity: 0; transform: translateX(-120%) skewX(-18deg); }
  55%  { opacity: 0.9; }
  100% { opacity: 0; transform: translateX(220%) skewX(-18deg); }
}
`;

function useGiftKeyframes(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
    // Deliberately never removed: it is ~2KB of static keyframes shared by
    // every live card, and tearing it down mid-animation would strip the
    // effect off any celebration still playing on another card.
  }, [active]);
}

/** Viewers who asked for less motion get the banner and none of the particles. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * The corner column every gift gets: emoji rising out of the bottom-right,
 * wobbling sideways as they climb.
 */
const CornerFloat = memo(({ tier, count }: { tier: GiftTier; count: number }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = jitter(i + 1, 3);
        const b = jitter(i + 1, 9);
        const c = jitter(i + 1, 17);
        return {
          i,
          style: {
            right: `${4 + a * 26}%`,
            bottom: `${2 + b * 10}%`,
            fontSize: `${20 + c * 22}px`,
            animationDelay: `${(i / Math.max(count, 1)) * (tier.durationMs * 0.55)}ms`,
            animationDuration: `${1800 + b * 1400}ms`,
            '--gift-drift': `${(a - 0.5) * 120}px`,
            '--gift-spin': `${(b - 0.5) * 90}deg`,
          } as CSSProperties,
        };
      }),
    [count, tier.durationMs],
  );

  return (
    <div className="absolute bottom-0 right-0 h-full w-1/2 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.i}
          className="absolute select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
          style={{ ...p.style, animationName: 'dehub-gift-float', animationTimingFunction: 'ease-out', animationFillMode: 'both' }}
        >
          {tier.emoji}
        </span>
      ))}
    </div>
  );
});
CornerFloat.displayName = 'CornerFloat';

/** Coins (or confetti chips) falling the full height of the player. */
const Rain = memo(({ count, items, durationMs }: { count: number; items: string[]; durationMs: number }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = jitter(i + 1, 23);
        const b = jitter(i + 1, 31);
        return {
          i,
          glyph: items[i % items.length],
          style: {
            left: `${a * 100}%`,
            top: 0,
            fontSize: `${14 + b * 18}px`,
            animationDelay: `${a * durationMs * 0.6}ms`,
            animationDuration: `${1400 + b * 1200}ms`,
            animationIterationCount: Math.max(1, Math.round(durationMs / 2200)),
            '--gift-drift': `${(b - 0.5) * 80}px`,
            '--gift-spin': `${(a - 0.5) * 720}deg`,
          } as CSSProperties,
        };
      }),
    [count, items, durationMs],
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.i}
          className="absolute select-none"
          style={{ ...p.style, animationName: 'dehub-gift-fall', animationTimingFunction: 'linear', animationFillMode: 'both' }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
});
Rain.displayName = 'Rain';

/** A gold wash with a slow siren pulse over it. */
const GoldWash = memo(({ durationMs }: { durationMs: number }) => (
  <>
    <div
      className="absolute inset-0 bg-gradient-to-b from-amber-300/45 via-yellow-400/25 to-amber-500/45 mix-blend-screen"
      style={{ animation: `dehub-gift-wash ${durationMs}ms ease-in-out both` }}
    />
    <div
      className="absolute inset-0"
      style={{
        boxShadow: 'inset 0 0 120px 30px rgba(251,191,36,0.75)',
        animation: `dehub-gift-siren 900ms ease-in-out infinite, dehub-gift-wash ${durationMs}ms ease-in-out both`,
      }}
    />
  </>
));
GoldWash.displayName = 'GoldWash';

/** The single big glyph that lands in the middle of the player. */
const CenterGlyph = memo(({ glyph, durationMs, glint }: { glyph: string; durationMs: number; glint?: boolean }) => (
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="relative" style={{ animation: `dehub-gift-pop ${durationMs}ms ease-out both` }}>
      <span className="select-none text-[72px] leading-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)] sm:text-[96px]">
        {glyph}
      </span>
      {glint && (
        <span
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent"
          style={{ animation: `dehub-gift-glint ${Math.min(durationMs, 1600)}ms ease-in-out 320ms both` }}
        />
      )}
    </div>
  </div>
));
CenterGlyph.displayName = 'CenterGlyph';

/** Concentric rings pulsing out of the middle. */
const Rings = memo(({ durationMs }: { durationMs: number }) => (
  <div className="absolute inset-0 flex items-center justify-center">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="absolute h-24 w-24 rounded-full border-2 border-purple-300/80"
        style={{ animation: `dehub-gift-ring ${Math.min(durationMs, 1600)}ms ease-out ${i * 260}ms infinite` }}
      />
    ))}
  </div>
));
Rings.displayName = 'Rings';

/** A shield wall crossing the lower third, each shield bobbing as it marches. */
const ShieldWall = memo(({ durationMs }: { durationMs: number }) => (
  <div className="absolute inset-x-0 bottom-[18%] h-24 overflow-hidden">
    <div className="flex h-full items-end gap-2" style={{ animation: `dehub-gift-march ${durationMs}ms linear both` }}>
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="select-none text-4xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
          style={{ animation: `dehub-gift-step ${620 + (i % 3) * 60}ms ease-in-out ${i * 70}ms infinite` }}
        >
          🛡️
        </span>
      ))}
    </div>
  </div>
));
ShieldWall.displayName = 'ShieldWall';

/** Bouquet: flowers thrown out of the bottom-right corner in a fan. */
const Bouquet = memo(() => {
  const petals = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (Math.PI / 2) * (i / 11) + Math.PI; // up-and-left quarter
        const reach = 120 + jitter(i + 1, 5) * 140;
        return {
          i,
          glyph: ['🌸', '🌹', '💐', '🌷'][i % 4],
          style: {
            animationDelay: `${i * 45}ms`,
            animationDuration: `${1400 + jitter(i + 1, 11) * 900}ms`,
            '--gift-dx': `${Math.cos(angle) * reach}px`,
            '--gift-dy': `${Math.sin(angle) * reach}px`,
            '--gift-spin': `${(jitter(i + 1, 13) - 0.5) * 360}deg`,
          } as CSSProperties,
        };
      }),
    [],
  );

  return (
    <div className="absolute bottom-[12%] right-[10%]">
      {petals.map((p) => (
        <span
          key={p.i}
          className="absolute select-none text-3xl"
          style={{ ...p.style, animationName: 'dehub-gift-burst', animationTimingFunction: 'ease-out', animationFillMode: 'both' }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
});
Bouquet.displayName = 'Bouquet';

/** Disco ball swinging in from the top on the party tiers. */
const DiscoBall = memo(({ durationMs }: { durationMs: number }) => (
  <div className="absolute inset-x-0 top-0 flex justify-center">
    <span
      className="select-none text-5xl drop-shadow-[0_4px_14px_rgba(255,255,255,0.5)]"
      style={{ transformOrigin: 'top center', animation: `dehub-gift-swing ${durationMs}ms ease-in-out both` }}
    >
      🪩
    </span>
  </div>
));
DiscoBall.displayName = 'DiscoBall';

const CONFETTI = ['🎊', '🎉', '✨', '🟡', '🔴', '🔵', '🟢'];
const COINS = ['🪙', '💰', '🟡'];

/** The per-tier composition. Every tier also gets the corner float. */
function TierEffect({ tier }: { tier: GiftTier }) {
  const d = tier.durationMs;
  switch (tier.key) {
    case 'ultimate':
      return (
        <>
          <GoldWash durationMs={d} />
          <Rain count={34} items={COINS} durationMs={d} />
          <Rain count={30} items={CONFETTI} durationMs={d} />
          <DiscoBall durationMs={d} />
          <CenterGlyph glyph="🏆" durationMs={d} glint />
        </>
      );
    case 'gold10':
    case 'gold3':
      return (
        <>
          <GoldWash durationMs={d} />
          <Rain count={tier.key === 'gold10' ? 34 : 20} items={COINS} durationMs={d} />
        </>
      );
    case 'party':
      return (
        <>
          <Rain count={32} items={CONFETTI} durationMs={d} />
          <DiscoBall durationMs={d} />
        </>
      );
    case 'spartans':
      return <ShieldWall durationMs={d} />;
    case 'magicRing':
      return (
        <>
          <Rings durationMs={d} />
          <CenterGlyph glyph="💍" durationMs={d} glint />
        </>
      );
    case 'crown':
      return <CenterGlyph glyph="👑" durationMs={d} glint />;
    case 'bouquet':
      return <Bouquet />;
    case 'chocolate':
    case 'heart':
    default:
      return null;
  }
}

/** How many corner emoji a tier is worth. */
const FLOAT_COUNT: Record<string, number> = {
  heart: 10,
  chocolate: 12,
  bouquet: 10,
  crown: 12,
  magicRing: 12,
  spartans: 14,
  party: 16,
  gold3: 16,
  gold10: 22,
  ultimate: 26,
};

const Celebration = memo(({ item }: { item: GiftCelebration }) => {
  const { t } = useTranslation();
  const { tier } = item;
  return (
    <div className="absolute inset-0">
      <TierEffect tier={tier} />
      <CornerFloat tier={tier} count={FLOAT_COUNT[tier.key] ?? 10} />
      {/* The caption is the only part that says who paid and how much — the
          effect alone reads as decoration. Left-aligned and clear of the
          bottom-right column so the two never overlap. */}
      <div
        className="absolute bottom-[14%] left-3 max-w-[55%]"
        style={{ animation: `dehub-gift-banner ${tier.durationMs}ms ease-out both` }}
      >
        <div className="rounded-xl border border-white/15 bg-black/60 px-3 py-2 backdrop-blur-sm">
          <p className="text-xs font-semibold text-white">
            <span aria-hidden className="mr-1">{tier.emoji}</span>
            {t(tier.labelKey, tier.name)}
          </p>
          <p className="text-[11px] text-white/70">
            {item.username
              ? t('liveGift.sentBy', '{{name}} · {{amount}} DHB', {
                  name: item.username,
                  amount: item.amount.toLocaleString(),
                })
              : t('liveGift.sentAmount', '{{amount}} DHB', { amount: item.amount.toLocaleString() })}
          </p>
          {item.message && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/80">{item.message}</p>}
        </div>
      </div>
    </div>
  );
});
Celebration.displayName = 'Celebration';

interface Props {
  items: GiftCelebration[];
  className?: string;
}

export function GiftAnimationOverlay({ items, className }: Props) {
  const active = items.length > 0;
  useGiftKeyframes(active);
  const reduced = usePrefersReducedMotion();
  // Keep the newest on top of an older one that is still playing.
  const rendered = items.slice(-2);
  if (!active) return null;

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-20 overflow-hidden', className)}
    >
      {rendered.map((item) =>
        reduced ? <ReducedCelebration key={item.id} item={item} /> : <Celebration key={item.id} item={item} />,
      )}
    </div>
  );
}

/** Reduced motion: the same information, none of the movement. */
const ReducedCelebration = memo(({ item }: { item: GiftCelebration }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-[14%] left-3 max-w-[70%] rounded-xl border border-white/15 bg-black/70 px-3 py-2">
      <p className="text-xs font-semibold text-white">
        <span aria-hidden className="mr-1">{item.tier.emoji}</span>
        {t(item.tier.labelKey, item.tier.name)}
      </p>
      <p className="text-[11px] text-white/70">
        {item.username
          ? t('liveGift.sentBy', '{{name}} · {{amount}} DHB', {
              name: item.username,
              amount: item.amount.toLocaleString(),
            })
          : t('liveGift.sentAmount', '{{amount}} DHB', { amount: item.amount.toLocaleString() })}
      </p>
    </div>
  );
});
ReducedCelebration.displayName = 'ReducedCelebration';

export default GiftAnimationOverlay;
