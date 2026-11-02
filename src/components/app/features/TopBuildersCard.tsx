/**
 * Top builders — "Score Bars".
 *
 * Sits at the top of the Shipped tab on the Requests page. Each person gets a
 * bar split into Shipped / Votes / Comments so the scoring explains itself.
 * Tap a row to see the breakdown and open their profile. Signed-in people who
 * are not in the top rows get their own rank pinned above the bottom bar on
 * phones (and as the last row on desktop) with the gap to the next place.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useTopBuilders } from '@/hooks/use-top-builders';
import { buildAvatarUrl } from '@/lib/media-url';
import { useProfileAvatar } from '@/hooks/use-profile-avatar-cache';
import { cn } from '@/lib/utils';
import type { BuilderPeriod, TopBuilder } from '@/lib/top-builders';

const SHOWN = 8;
const SHIPPED_COLOR = 'var(--top-builders-shipped, var(--tint-accent, rgb(161 161 170)))';
const VOTES_COLOR = 'rgb(245 200 75)';
const COMMENTS_COLOR = 'rgb(125 211 252)';

function displayName(b: TopBuilder) {
  return b.username || `${b.wallet.slice(0, 6)}…${b.wallet.slice(-4)}`;
}

function BuilderAvatar({ builder, size = 30 }: { builder: TopBuilder; size?: number }) {
  const dbUrl = builder.avatar ? buildAvatarUrl(builder.wallet, builder.avatar) : undefined;
  const url = useProfileAvatar(builder.wallet, dbUrl) ?? dbUrl ?? null;
  const letter = displayName(builder).slice(0, 1).toUpperCase();
  return url ? (
    <img src={url} alt="" loading="lazy" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full shrink-0 grid place-items-center bg-zinc-700 text-white text-xs font-semibold" style={{ width: size, height: size }}>{letter}</span>
  );
}

function ScoreBar({ builder, max }: { builder: TopBuilder; max: number }) {
  const pct = (n: number) => `${(n / builder.points) * 100}%`;
  return (
    <span
      className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/10"
      style={{ width: `${Math.max(12, (builder.points / max) * 100)}%` }}
      aria-hidden
    >
      <i className="block h-full" style={{ width: pct(builder.shippedPoints), background: SHIPPED_COLOR }} />
      <i className="block h-full" style={{ width: pct(builder.votePoints), background: VOTES_COLOR }} />
      <i className="block h-full" style={{ width: pct(builder.commentPoints), background: COMMENTS_COLOR }} />
    </span>
  );
}

function Breakdown({ b }: { b: TopBuilder }) {
  const { t } = useTranslation();
  return (
    <span className="mt-1.5 block text-[11.5px] text-zinc-400">
      {t('features.topBuilders.breakdown', '{{shipped}} shipped ({{sp}}) · {{votes}} upvotes ({{vp}}) · {{comments}} comments ({{cp}})', {
        shipped: b.shipped, sp: b.shippedPoints, votes: b.votes, vp: b.votePoints, comments: b.comments, cp: b.commentPoints,
      })}
    </span>
  );
}

function BuilderRow({ b, rank, max, open, onToggle, mine }: { b: TopBuilder; rank: number; max: number; open: boolean; onToggle: () => void; mine?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className={cn('rounded-xl', mine && 'bg-white/[0.06] ring-1 ring-white/10')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left hover:bg-white/[0.05]"
      >
        <span className="w-5 shrink-0 text-center text-xs tabular-nums text-zinc-500">{rank}</span>
        <BuilderAvatar builder={b} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-white">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{mine ? t('features.topBuilders.you', 'You') : displayName(b)}</span>
              {b.username && <BadgeIcon username={b.username} lookupId={b.wallet} className="w-[1em] h-[1em] shrink-0" />}
            </span>
            <span className="tabular-nums">{b.points}</span>
          </span>
          <ScoreBar builder={b} max={max} />
          {open && <Breakdown b={b} />}
        </span>
      </button>
      {open && (
        <div className="flex justify-end px-1.5 pb-1.5">
          <button
            type="button"
            onClick={() => navigate(b.username ? `/${b.username}` : `/app/profile?id=${b.wallet}`)}
            className="rounded-lg px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-white/[0.06]"
          >
            {t('features.topBuilders.viewProfile', 'View profile')}
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBuildersCard() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [period, setPeriod] = useState<BuilderPeriod>('month');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { builders, isLoading } = useTopBuilders(period);

  const me = walletAddress?.toLowerCase() ?? null;
  const myIndex = me ? builders.findIndex((b) => b.wallet === me) : -1;
  const shown = builders.slice(0, SHOWN);
  const max = builders[0]?.points ?? 1;

  // Signed in but not in the shown rows: pin "You" with the gap to the next place.
  const pin = useMemo(() => {
    if (!me || (myIndex >= 0 && myIndex < SHOWN)) return null;
    const mine = myIndex >= 0 ? builders[myIndex] : null;
    const target = myIndex > 0 ? builders[myIndex - 1] : builders[Math.min(SHOWN, builders.length) - 1];
    const points = mine?.points ?? 0;
    return {
      rank: myIndex >= 0 ? myIndex + 1 : null,
      points,
      gap: target ? Math.max(1, target.points - points + 1) : null,
      target,
    };
  }, [me, myIndex, builders]);

  if (!isLoading && builders.length === 0) return null;

  const pinText = pin?.gap && pin.target
    ? t('features.topBuilders.gap', '{{n}} pts to pass {{name}}', { n: pin.gap, name: `@${displayName(pin.target)}` })
    : t('features.topBuilders.join', 'Post a prompt that ships to join the board');

  const pinBody = pin && (
    <div className="flex items-center gap-2.5">
      <span className="w-7 shrink-0 text-center text-xs tabular-nums text-zinc-500">{pin.rank ? `#${pin.rank}` : '–'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between text-[13px] font-semibold text-white">
          <span>{t('features.topBuilders.you', 'You')}</span>
          <span className="tabular-nums">{t('features.topBuilders.pts', '{{n}} pts', { n: pin.points })}</span>
        </div>
        <div className="truncate text-[11.5px] text-zinc-400">{pinText}</div>
        {pin.target && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <i className="block h-full" style={{ width: `${Math.min(100, (pin.points / (pin.target.points + 1)) * 100)}%`, background: SHIPPED_COLOR }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <section data-page-bento data-top-builders className="mb-3 rounded-2xl bg-zinc-900 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <ThemedIcon icon="trophy" alt="" className="h-5 w-5 object-contain" />
            {t('features.topBuilders.title', 'Top builders')}
          </h2>
          <div className="flex rounded-full bg-white/[0.07] p-0.5" role="group">
            {(['month', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => { setPeriod(p); setOpenKey(null); }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs transition-colors',
                  period === p ? 'bg-white text-black' : 'text-zinc-400 hover:text-white',
                )}
              >
                {p === 'month' ? t('features.topBuilders.month', 'This month') : t('features.topBuilders.allTime', 'All time')}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: SHIPPED_COLOR }} />{t('features.topBuilders.shipped', 'Shipped')}</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: VOTES_COLOR }} />{t('features.topBuilders.votes', 'Votes')}</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: COMMENTS_COLOR }} />{t('features.topBuilders.comments', 'Comments')}</span>
        </div>
        <div className="mt-1.5 flex flex-col">
          {isLoading
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="my-1 h-9 animate-pulse rounded-xl bg-white/[0.05]" />)
            : shown.map((b, i) => (
              <BuilderRow
                key={b.wallet}
                b={b}
                rank={i + 1}
                max={max}
                mine={b.wallet === me}
                open={openKey === b.wallet}
                onToggle={() => setOpenKey((k) => (k === b.wallet ? null : b.wallet))}
              />
            ))}
          {pin && !isLoading && <div className="mt-1 hidden rounded-xl bg-white/[0.06] p-2 ring-1 ring-white/10 md:block">{pinBody}</div>}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          {t('features.topBuilders.rule', '10 pts per shipped request, 1 per upvote, 2 per comment on someone else\'s request.')}
        </p>
      </section>
      {pin && !isLoading && (
        <div
          data-top-builders-pin
          className="fixed inset-x-3 z-30 rounded-2xl border border-white/10 bg-zinc-900/80 p-2.5 backdrop-blur-xl md:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
        >
          {pinBody}
        </div>
      )}
    </>
  );
}
