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
 * All twelve powers are listed in unlock order. Killer Whale remains a badge
 * tier with a stronger allowance, but it does not add a separate power.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Check, Clock, History, ChevronRight, Users, X } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { BadgeProgress } from '@/components/app/BadgeProgress';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { badgeImage } from '@/lib/staking-badges';
import {
  powerHome,
  useCancelBoost,
  useSuperpowerLadder,
  useSuperpowers,
} from '@/hooks/use-superpowers';
import { SpendPowerDrawer } from '@/components/app/modals/SpendPowerDrawer';
import type { SuperPowerInfo, SuperPowerKey } from '@/lib/api/dehub/superpowers';
import { TeamUpDrawer } from '@/components/app/TeamUpDrawer';

/**
 * What an unlocked power acts on, in one line under its name.
 *
 * Not directions any more. Every bento this account holds is a button that
 * opens the picker for its own target, so the only thing left worth saying on
 * the card is what kind of thing you are about to be asked to choose.
 * `powerHome` is the same table the picker and the post sheet read, so the
 * three cannot drift apart.
 */
function actsOn(key: SuperPowerKey, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (powerHome(key)) {
    case 'gift':
      return t('superpowers.actsGift', {
        defaultValue: "A gift — it lands on somebody else's post. Tap to pick one.",
      });
    case 'comment':
      return t('superpowers.actsComment', {
        defaultValue: "Acts on your comment in somebody else's thread. Tap to pick one.",
      });
    case 'stage':
      return t('superpowers.actsStage', {
        defaultValue: 'Acts on a Stage you host. Tap to pick one.',
      });
    case 'page':
      return t('superpowers.actsCategory', {
        defaultValue: 'Acts on one of your categories. Tap to pick one.',
      });
    default:
      return t('superpowers.actsPost', {
        defaultValue: 'Acts on one of your posts. Tap to pick one.',
      });
  }
}

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
  const { data: status, isLoading: loadingStatus, isError, refetch: refetchStatus } = useSuperpowers();
  const { data: ladder, isLoading: loadingLadder } = useSuperpowerLadder();
  const cancelBoost = useCancelBoost();

  // The public ladder carries every power; the signed-in one adds `unlocked`.
  // Prefer the personal copy so the page lights up without a second render.
  const powers = (status?.powers ?? ladder?.powers ?? []).filter(
    power => String(power.key) !== 'golden_hour',
  );

  const refillsOn = useMemo(() => {
    const iso = status?.cycleEndsAt ?? ladder?.cycleEndsAt;
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }, [status?.cycleEndsAt, ladder?.cycleEndsAt]);

  // One drawer for every spendable power. It resolves the target a power needs — a
  // post, a comment, a Stage, a category — and books it; the server re-checks
  // every one of those, so this only decides what is worth offering.
  const [spending, setSpending] = useState<SuperPowerInfo | null>(null);
  const [historyPower, setHistoryPower] = useState<SuperPowerInfo | null>(null);
  const [teamUpOpen, setTeamUpOpen] = useState(false);

  const badgeArt = badgeImage(status?.tier);
  const historyBookings = historyPower
    ? (status?.bookings.filter(booking => booking.power === historyPower.key) ?? [])
    : [];

  return (
    <>
      <SEOHead
        title="SuperPowers — Spend Your DeHub Badge on Reach"
        description="Use badge-powered boosts, or Team up with as many as seven others to unlock a higher shared badge."
        url="https://dehub.io/app/superpowers"
        image="https://dehub.io/og/superpowers.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'DeHub SuperPowers',
          description:
            'DeHub SuperPowers include badge-powered boosts and Team up, which combines wallet power for a higher shared badge.',
          url: 'https://dehub.io/app/superpowers',
          isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />

      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ThemedIcon icon="superpowers" alt="" className="w-8 h-8 object-contain" />
            {t('superpowers.title')}
          </h1>
          <p className="text-sm text-zinc-400 max-w-prose">
            {t('superpowers.currentIntro', {
              defaultValue:
                'Badge holders get fresh boosts every fortnight. Team up is open to everyone: combine wallet power with up to seven others and every member gets the badge your total unlocks.',
            })}
          </p>
        </header>

        {/* ── Your allowance ─────────────────────────────────────────── */}
        {loadingStatus ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : status?.tier ? (
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {/* `badgeImage(status.tier)`, not `getBadgeUrl(balance)`: the server already
                  resolved the tier WITH the grandfathering lock, and re-deriving it
                  from the balance alone drops that — a locked holder would see art
                  a rung below the tier they are actually spending at. And a null
                  never becomes src="", which requests the page again. */}
              {badgeArt && (
                <img src={badgeArt} alt={status.tier} className="w-11 h-11 shrink-0" />
              )}
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
            </div>

            {refillsOn && (
              <p className="text-[12px] text-zinc-500">
                {t('superpowers.refillsOn', {
                  date: refillsOn,
                  defaultValue: `Refills on ${refillsOn} — the same moment for everybody.`,
                })}
              </p>
            )}

          </section>
        ) : isError ? (
          // A failed request is not the same as no badge. Telling a Meglodon
          // to go and stake because the API blipped is worse than saying
          // nothing — and the ladder below still renders from the public
          // endpoint, so the page is not empty.
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3">
            <p className="text-white text-sm">{t('superpowers.loadFailed')}</p>
          </section>
        ) : (
          // No badge — the page's real audience. Say what it costs and where.
          <section className="rounded-2xl bg-white/5 p-5 flex flex-col gap-3">
            <p className="text-white text-sm">{t('superpowers.noBadgeYet')}</p>
            <p className="text-[12px] text-zinc-400">Team up is open to every account, even without a badge.</p>
            <BadgeProgress variant="rail" />
            <Button asChild variant="outline" className="self-start">
              <Link to="/app/stake">{t('superpowers.stakeDhb')}</Link>
            </Button>
          </section>
        )}

        {/* ── The twelve powers ──────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            {t('superpowers.currentPowersHeading', { defaultValue: 'The twelve powers' })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {powers.map((power, index) => {
              const isTeamUp = power.key === 'team_up';
              // Team up itself is public. Opening it while signed out leads
              // straight to the sign-in action in the drawer.
              const unlocked = isTeamUp || !!power.unlocked;
              // Held AND built. A locked card stays inert rather than opening a
              // picker for something the server would refuse.
              const usable = unlocked && power.available;
              const allowance =
                power.key === 'signal_flare'
                  ? (status?.signalsLeft ?? status?.boostsLeft)
                  : status?.boostsLeft;
              return (
                <article
                  key={power.key}
                  className={cn(
                    'rounded-xl border overflow-hidden flex flex-col transition-colors',
                    usable
                      ? 'border-white/20 bg-white/5'
                      : 'border-white/10 bg-white/[0.02]',
                  )}
                >
                  <button
                    type="button"
                    disabled={!usable}
                    onClick={() => isTeamUp ? setTeamUpOpen(true) : setSpending(power)}
                    className={cn(
                      'p-4 pb-3 flex flex-1 flex-col gap-1.5 text-left transition-colors',
                      usable ? 'hover:bg-white/5 active:bg-white/10' : 'cursor-default',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Numbered because this is a fixed, ordered power list. */}
                      <span className="text-[11px] text-zinc-600 tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={cn('text-sm font-medium', unlocked ? 'text-white' : 'text-zinc-400')}>
                        {power.label}
                      </span>
                      {isTeamUp && unlocked
                        ? <Users className="w-3.5 h-3.5 text-white shrink-0" />
                        : unlocked && power.available && <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                      {!unlocked && <Lock className="w-3 h-3 text-zinc-600 shrink-0" />}
                    </div>
                    <p className="text-[13px] text-zinc-500 leading-snug">{power.summary}</p>
                    {usable && <p className="text-[11px] text-zinc-400 leading-snug">
                      {isTeamUp ? 'Make or join a team. Tap to manage yours.' : actsOn(power.key, t)}
                    </p>}
                  </button>
                  <div className="min-h-11 border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'text-[12px] font-semibold tabular-nums',
                        usable ? 'text-white' : 'text-zinc-500',
                      )}
                    >
                      {isTeamUp && unlocked
                        ? 'Open to everyone'
                        : usable && allowance !== undefined
                        ? `${allowance} ${allowance === 1 ? 'use' : 'uses'} left`
                        : !power.available
                          ? t('superpowers.comingSoon')
                          : 'Locked'}
                    </span>
                    {!isTeamUp && <button
                      type="button"
                      onClick={() => {
                        setHistoryPower(power);
                        void refetchStatus();
                      }}
                      disabled={!status?.tier}
                      className="group inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white active:text-white transition-colors disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Past usage
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>}
                  </div>
                </article>
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

      {/* Literal DrawerContent lives inside this component, so vaul's deferred
          Root still sees it — see the note in ui/drawer.tsx. */}
      <SpendPowerDrawer power={spending} onOpenChange={open => !open && setSpending(null)} />
      <TeamUpDrawer open={teamUpOpen} onOpenChange={setTeamUpOpen} />

      <Drawer open={!!historyPower} onOpenChange={open => !open && setHistoryPower(null)}>
        <DrawerContent column glass className="px-4 pb-6">
          <DrawerHeader className="pb-3 flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle className="text-white text-lg">
                {historyPower?.label} usage
              </DrawerTitle>
              <p className="text-[12px] text-zinc-500 mt-1">
                This cycle and anything still active.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryPower(null)}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </DrawerHeader>

          <div className="max-h-[62vh] overflow-y-auto flex flex-col gap-2">
            {historyBookings.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 flex flex-col items-center text-center gap-2">
                <History className="w-6 h-6 text-zinc-500" aria-hidden="true" />
                <p className="text-sm text-zinc-300">No past usage for this power yet.</p>
              </div>
            ) : (
              historyBookings.map(booking => {
                const flare = booking.power === 'signal_flare';
                const result = flare
                  ? booking.signalDeliveryStatus === 'sent'
                    ? `${booking.signalRecipients ?? 0} notified`
                    : booking.signalDeliveryStatus === 'failed'
                      ? 'Delivery retrying'
                      : 'Notifying followers'
                  : t('superpowers.seenCount', {
                      count: booking.served,
                      defaultValue: `${booking.served} seen`,
                    });
                const subject = booking.tokenId != null
                  ? `Post #${booking.tokenId}`
                  : booking.category || historyPower?.label || booking.power;

                return (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 flex items-center gap-3"
                  >
                    <Clock className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      {booking.tokenId != null ? (
                        <Link to={`/app/post/${booking.tokenId}`} className="text-sm text-white hover:underline truncate block">
                          {subject}
                        </Link>
                      ) : (
                        <p className="text-sm text-white truncate">{subject}</p>
                      )}
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {new Date(booking.startsAt).toLocaleString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-medium text-zinc-200 tabular-nums">{result}</p>
                      {!flare && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {booking.live
                            ? 'Live'
                            : booking.status === 'active'
                              ? t('superpowers.queued')
                              : 'Finished'}
                        </p>
                      )}
                    </div>
                    {booking.status === 'active' && !flare && (
                      <button
                        type="button"
                        onClick={() =>
                          cancelBoost.mutate(booking.id, {
                            onSuccess: ({ refunded }) =>
                              toast.success(
                                refunded
                                  ? t('superpowers.cancelledRefunded')
                                  : t('superpowers.cancelledSpent'),
                              ),
                            onError: (error: unknown) =>
                              toast.error(
                                error instanceof Error ? error.message : t('superpowers.cancelFailed'),
                              ),
                          })
                        }
                        disabled={cancelBoost.isPending}
                        className="text-[12px] text-zinc-400 hover:text-white transition-colors disabled:opacity-40 shrink-0"
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
