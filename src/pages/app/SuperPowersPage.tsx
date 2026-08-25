/**
 * SuperPowers
 * ===========
 * What a badge buys beyond the art next to your name. Your tier, the boosts it
 * grants this cycle, what you have spent them on, and the whole thirteen-rung
 * ladder lit against where you stand.
 *
 * The page is deliberately readable **signed out and badgeless**. Somebody who
 * has not staked is the entire audience for it — a page that greets them with
 * "connect a wallet" tells them nothing about why they would want to. So the
 * ladder renders for everyone from the public endpoint, and the allowance
 * panel is the part that needs an account.
 *
 * Two of the thirteen powers are built. The other eleven are listed anyway,
 * dimmed and labelled, because the ladder is the product: the reason to climb
 * a rung is knowing what the next one holds.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, Rocket, Lock, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { BadgeProgress } from '@/components/app/BadgeProgress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useCancelBoost, useSuperpowerLadder, useSuperpowers } from '@/hooks/use-superpowers';

/** Total slot minutes a tier holds per cycle — the number worth comparing. */
function cycleMinutes(boosts: number, minutes: number): number {
  return boosts * minutes;
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function SuperPowersPage() {
  const { t } = useTranslation();
  const { data: status, isLoading: loadingStatus } = useSuperpowers();
  const { data: ladder, isLoading: loadingLadder } = useSuperpowerLadder();
  const cancelBoost = useCancelBoost();

  // The public ladder carries every power; the signed-in one adds `unlocked`.
  // Prefer the personal copy so the page lights up without a second render.
  const powers = status?.powers ?? ladder?.powers ?? [];

  const refillsOn = useMemo(() => {
    const iso = status?.cycleEndsAt ?? ladder?.cycleEndsAt;
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }, [status?.cycleEndsAt, ladder?.cycleEndsAt]);

  const liveBookings = status?.bookings.filter(b => b.status === 'active') ?? [];
  const spentBookings = status?.bookings.filter(b => b.status === 'completed') ?? [];

  return (
    <>
      <SEOHead
        title="SuperPowers — Spend Your DeHub Badge on Reach"
        description="Badge holders get boosts every fortnight: put a post in the slot at the top of the DeHub home feed. Thirteen tiers, thirteen powers, one unlock per rung."
        url="https://dehub.io/app/superpowers"
        image="https://dehub.io/og/superpowers.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'DeHub SuperPowers',
          description:
            'What a DeHub staking badge buys: boosts to the top of the home feed, refilled every fortnight, scaling across thirteen tiers.',
          url: 'https://dehub.io/app/superpowers',
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            {t('superpowers.title')}
          </h1>
          <p className="text-sm text-zinc-400 max-w-prose">{t('superpowers.intro')}</p>
        </header>

        {/* ── Your allowance ─────────────────────────────────────────── */}
        {loadingStatus ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : status?.tier ? (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <img src={getBadgeUrl(status.badgeBalance) ?? ''} alt={status.tier} className="w-11 h-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-white font-medium">{status.tier}</p>
                <p className="text-[12px] text-zinc-400">
                  {t('superpowers.grantLine', {
                    boosts: status.boostsPerCycle,
                    minutes: status.minutesPerBoost,
                    defaultValue: `${status.boostsPerCycle} × ${status.minutesPerBoost} minutes a cycle`,
                  })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="block text-2xl font-semibold text-white tabular-nums">
                  {status.boostsLeft}
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  {t('superpowers.left')}
                </span>
              </div>
            </div>

            {refillsOn && (
              <p className="text-[12px] text-zinc-500">
                {t('superpowers.refillsOn', {
                  date: refillsOn,
                  defaultValue: `Refills on ${refillsOn} — the same moment for everybody.`,
                })}
              </p>
            )}

            {/* Live and queued boosts. Cancelling one that has not opened yet
                gives the boost back; once it has been in the slot it has not. */}
            {liveBookings.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                {liveBookings.map(booking => (
                  <div key={booking.id} className="flex items-center gap-3 text-sm">
                    <Clock className={cn('w-4 h-4 shrink-0', booking.live ? 'text-green-400' : 'text-zinc-500')} />
                    <Link to={`/app/post/${booking.tokenId}`} className="text-white hover:underline truncate">
                      #{booking.tokenId}
                    </Link>
                    <span className="text-zinc-500 text-[12px] shrink-0">
                      {booking.live
                        ? t('superpowers.liveUntil', {
                            time: new Date(booking.endsAt).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                            defaultValue: `live until ${new Date(booking.endsAt).toLocaleTimeString()}`,
                          })
                        : t('superpowers.queued')}
                    </span>
                    <span className="ml-auto text-zinc-500 text-[12px] tabular-nums shrink-0">
                      {t('superpowers.seenCount', {
                        count: booking.served,
                        defaultValue: `${booking.served} seen`,
                      })}
                    </span>
                    <button
                      onClick={() =>
                        cancelBoost.mutate(booking.id, {
                          onSuccess: ({ refunded }) =>
                            toast.success(
                              refunded
                                ? t('superpowers.cancelledRefunded')
                                : t('superpowers.cancelledSpent'),
                            ),
                          onError: (error: any) => toast.error(error?.message || t('superpowers.cancelFailed')),
                        })
                      }
                      disabled={cancelBoost.isPending}
                      className="text-[12px] text-zinc-400 hover:text-white transition-colors shrink-0 disabled:opacity-40"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {spentBookings.length > 0 && (
              <p className="text-[12px] text-zinc-500 border-t border-white/10 pt-3">
                {t('superpowers.finishedCount', {
                  count: spentBookings.length,
                  seen: spentBookings.reduce((sum, b) => sum + b.served, 0),
                  defaultValue: `${spentBookings.length} finished this cycle, seen ${spentBookings.reduce((sum, b) => sum + b.served, 0)} times`,
                })}
              </p>
            )}
          </section>
        ) : (
          // No badge — the page's real audience. Say what it costs and where.
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3">
            <p className="text-white text-sm">{t('superpowers.noBadgeYet')}</p>
            <BadgeProgress variant="rail" />
            <Button asChild variant="outline" className="self-start">
              <Link to="/app/stake">{t('superpowers.stakeDhb')}</Link>
            </Button>
          </section>
        )}

        {/* ── The thirteen powers ────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            {t('superpowers.powersHeading')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {powers.map((power, index) => {
              const unlocked = !!power.unlocked;
              return (
                <div
                  key={power.key}
                  className={cn(
                    'rounded-xl border p-4 flex flex-col gap-1.5 transition-colors',
                    unlocked && power.available
                      ? 'border-white/20 bg-white/5'
                      : 'border-white/10 bg-white/[0.02]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Numbered because it IS a sequence: one power per rung,
                        in ladder order. */}
                    <span className="text-[11px] text-zinc-600 tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={cn('text-sm font-medium', unlocked ? 'text-white' : 'text-zinc-400')}>
                      {power.label}
                    </span>
                    {unlocked && power.available && <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                    {!unlocked && <Lock className="w-3 h-3 text-zinc-600 shrink-0" />}
                  </div>
                  <p className="text-[13px] text-zinc-500 leading-snug">{power.summary}</p>
                  <p className="text-[11px] text-zinc-600 mt-auto pt-1">
                    {power.tier}
                    {!power.available && ` · ${t('superpowers.comingSoon')}`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── The ladder ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            {t('superpowers.ladderHeading')}
          </h2>

          {loadingLadder ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="text-left font-medium px-4 py-3">{t('superpowers.colTier')}</th>
                    <th className="text-right font-medium px-3 py-3">{t('superpowers.colBoosts')}</th>
                    <th className="text-right font-medium px-3 py-3">{t('superpowers.colEach')}</th>
                    <th className="text-right font-medium px-4 py-3">{t('superpowers.colTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(ladder?.tiers ?? [])
                    .filter(tier => tier.name)
                    .map(tier => {
                      const isMine = status?.tier === tier.name;
                      return (
                        <tr
                          key={tier.name}
                          className={cn(
                            'border-t border-white/5',
                            isMine ? 'bg-white/10 text-white' : 'text-zinc-400',
                          )}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={cn(isMine && 'font-medium')}>{tier.name}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{tier.boostsPerCycle}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{tier.minutesPerBoost}m</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatMinutes(cycleMinutes(tier.boostsPerCycle, tier.minutesPerBoost))}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* The honest sentence, once, where the numbers are. */}
          <p className="text-[12px] text-zinc-500 max-w-prose">{t('superpowers.shareOfVoice')}</p>
        </section>
      </div>
    </>
  );
}
