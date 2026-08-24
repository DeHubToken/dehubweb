/**
 * BadgeProgress — where a holder sits on the badge ladder, and what the next
 * rung costs.
 *
 * The badge next to a name is nine pixels wide and says nothing about how it
 * was earned or how close the next one is. This is the other half: the tier
 * you hold, the bar filling toward the one above it, and the whole thirteen-rung
 * ladder with the ones you have lit and the ones you have not dimmed.
 *
 * Requirements come from `badgeThresholds()`, not from the reference table, so
 * every number on screen is what that tier costs *today* — the ladder is pegged
 * in dollars and moves with the token price. A holder who is standing on a
 * grandfathered tier is told so, because otherwise the bar would read as if
 * they were below the rung they are visibly on.
 *
 * Monochrome by design (src/index.css): the glow is white, not a colour.
 */

import { useContext, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  BADGE_USD_TARGETS,
  badgeImage,
  badgeThresholds,
  getBadgeStanding,
  type BadgeLock,
} from '@/lib/staking-badges';
import { engagementWeightForBadge, formatEngagementWeight } from '@/lib/engagement-weight';
import { useBadgeLadderPrice, useBadgeScale } from '@/hooks/use-badge-scale';
import { useSelfBadge, preferLiveBalance } from '@/hooks/use-self-badge-balance';
import { AuthContext } from '@/contexts/AuthContext';

export interface BadgeProgressProps {
  /**
   * DHB counted toward the ladder. Omit to read the signed-in user's own —
   * their live wallet balance included, so the bar moves on the same beat as
   * the badge does.
   */
  balance?: number | string | null;
  /** Username, for the override table. Defaults to the signed-in user's. */
  username?: string | null;
  /** The holder's grandfathered tier. Defaults to the signed-in user's. */
  lock?: BadgeLock | null;
  /** `rail` drops the ladder strip, for tight columns. */
  variant?: 'full' | 'rail';
  className?: string;
}

/** Compact DHB, in the same shape the staking page uses. */
function formatDhb(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(value).toLocaleString();
}

/** Whole dollars below four figures, compact above. */
function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  if (value >= 1) return `$${Math.round(value)}`;
  return `$${value.toFixed(2)}`;
}

export function BadgeProgress({ balance, username, lock, variant = 'full', className }: BadgeProgressProps) {
  // Read the context directly rather than through useAuth: badges render on
  // surfaces above AuthProvider, where the hook throws.
  const auth = useContext(AuthContext);
  const self = useSelfBadge();
  const scale = useBadgeScale();
  const price = useBadgeLadderPrice();
  const reduceMotion = useReducedMotion();

  // Nothing passed means "me": the account row's balance, promoted by the live
  // wallet read the same way every badge on the site is.
  const ownBalance = preferLiveBalance(auth?.user?.badgeBalance, self.balance);
  const effectiveBalance = balance ?? ownBalance;
  const effectiveName = username ?? auth?.user?.username ?? null;
  const effectiveLock = lock ?? self.lock ?? null;

  const ladder = useMemo(() => badgeThresholds(scale), [scale]);
  const standing = useMemo(
    () => getBadgeStanding(effectiveBalance, { username: effectiveName, scale, lock: effectiveLock }),
    [effectiveBalance, effectiveName, scale, effectiveLock],
  );

  const percent = Math.round(standing.progress * 100);
  const nextThresholdUsd = standing.nextTier ? BADGE_USD_TARGETS[standing.nextTier] : null;
  const weight = engagementWeightForBadge(standing.tier);

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 overflow-hidden relative',
        className,
      )}
    >
      {/* The one soft light in the panel, behind the medallion. */}
      <div className="pointer-events-none absolute -top-16 -left-10 w-40 h-40 rounded-full bg-white/[0.07] blur-3xl" />

      <div className="relative flex items-center gap-3 sm:gap-4">
        <BadgeMedallion url={standing.imageUrl} tier={standing.tier} reduceMotion={!!reduceMotion} />

        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-semibold text-white truncate">
            {standing.tier ?? 'No badge yet'}
          </div>
          <div className="text-[11px] sm:text-xs text-white/50 font-mono truncate">
            {formatDhb(standing.balance)} DHB
            {price ? <span className="text-white/30"> · {formatUsd(standing.balance * price)}</span> : null}
          </div>
        </div>

        <div className="text-right shrink-0">
          {standing.nextTier ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-white/30">Next</div>
              <div className="text-xs sm:text-sm font-medium text-white/80">{standing.nextTier}</div>
            </>
          ) : (
            <div className="text-[10px] uppercase tracking-wider text-white/40">Top tier</div>
          )}
        </div>
      </div>

      {/* The bar. Fills across the current tier, not across the whole ladder —
          crawling 2% of the way to Meglodon is not progress anyone can feel. */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={standing.nextTier ? `Progress to ${standing.nextTier}` : 'Top tier reached'}
        className="relative mt-4 h-2.5 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/40 via-white/75 to-white shadow-[0_0_14px_2px_rgba(255,255,255,0.45)]"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${Math.max(percent, standing.progress > 0 ? 2 : 0)}%` }}
          transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Sweep, clipped to the filled length so it reads as the bar being
              charged rather than as a loading skeleton. */}
          {!reduceMotion && standing.progress > 0.02 && (
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span
                className="absolute inset-y-0 -left-1/4 w-1/4 bg-gradient-to-r from-transparent via-white to-transparent opacity-60"
                style={{ animation: 'shimmer-sweep 2.6s ease-in-out infinite' }}
              />
            </span>
          )}
        </motion.div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono text-white/40">{percent}%</span>
        <span className="text-white/60 truncate">
          {standing.nextTier
            ? `${formatDhb(standing.remaining)} DHB to ${standing.nextTier}`
            : 'Every tier unlocked'}
        </span>
      </div>

      {/* What the tier actually does, beyond drawing a picture. */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
        <span className="font-mono text-sm text-white shrink-0">{formatEngagementWeight(weight)}</span>
        <span className="text-[11px] leading-snug text-white/55">
          {standing.tier
            ? `Every view you give and every reaction you leave counts ${formatEngagementWeight(weight)}. Still one reaction — it is just worth more.`
            : 'Views and reactions count once. A badge multiplies that — ×2 at Crab, up to ×14 at Meglodon.'}
        </span>
      </div>

      {variant === 'full' && (
        <BadgeLadderRail ladder={ladder} index={standing.index} reduceMotion={!!reduceMotion} price={price} />
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-white/35">
        Tiers are priced in dollars, so the DHB each one costs moves with the token.
        {standing.nextTier && nextThresholdUsd
          ? ` ${standing.nextTier} is about ${formatUsd(nextThresholdUsd)} of DHB — ${formatDhb(
              standing.nextThreshold ?? 0,
            )} at today's price.`
          : ' Meglodon is about $50,000 of DHB at any price.'}
      </p>

      {standing.grandfathered && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/50">
          {standing.tier} is locked in. You keep it while you hold at least{' '}
          <span className="font-mono text-white/70">{formatDhb(effectiveLock?.requirement ?? 0)} DHB</span> — what it
          cost when you earned it — whatever the ladder does after.
        </p>
      )}
    </div>
  );
}

/** The current badge, lit. Falls back to an empty ring below the entry rung. */
function BadgeMedallion({
  url,
  tier,
  reduceMotion,
}: {
  url: string | null;
  tier: string | null;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
      <motion.div
        className="absolute inset-0 rounded-full bg-white/10 blur-md"
        animate={reduceMotion || !url ? undefined : { opacity: [0.35, 0.75, 0.35] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative w-full h-full rounded-full border border-white/15 bg-white/[0.04] flex items-center justify-center">
        {url ? (
          <img
            src={url}
            alt={tier || 'Badge'}
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain brightness-0 invert drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]"
          />
        ) : (
          <span className="text-[9px] uppercase tracking-wider text-white/30">None</span>
        )}
      </div>
    </div>
  );
}

/** All thirteen rungs: earned ones lit, the rest waiting. */
function BadgeLadderRail({
  ladder,
  index,
  reduceMotion,
  price,
}: {
  ladder: readonly { name: string; min: number }[];
  index: number;
  reduceMotion: boolean;
  price?: number;
}) {
  return (
    <div className="mt-4 -mx-1 flex items-center gap-0.5 overflow-x-auto px-1 pb-1 scrollbar-hide">
      {ladder.map((rung, i) => {
        const earned = i <= index;
        const current = i === index;
        const art = badgeImage(rung.name);

        return (
          <Tooltip key={rung.name}>
            <TooltipTrigger asChild>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : i * 0.035, duration: 0.3 }}
                className={cn(
                  'relative shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all',
                  earned ? 'bg-white/[0.07]' : 'bg-white/[0.02]',
                  current && 'ring-1 ring-white/50 bg-white/[0.12]',
                )}
              >
                {art && (
                  <img
                    src={art}
                    alt={rung.name}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'w-4 h-4 sm:w-[18px] sm:h-[18px] object-contain brightness-0 invert transition-all',
                      earned ? 'opacity-100' : 'opacity-25',
                      current && 'drop-shadow-[0_0_6px_rgba(255,255,255,0.75)]',
                    )}
                  />
                )}
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <span className="font-medium">{rung.name}</span>
              <span className="text-white/50">
                {' '}
                · {formatDhb(rung.min)} DHB
                {price ? ` · ${formatUsd(rung.min * price)}` : ''}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default BadgeProgress;
