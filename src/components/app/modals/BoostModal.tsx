/**
 * Boost Modal
 * ===========
 * Spending one of a badge holder's SuperPowers on a post. Opened from the
 * post's options drawer, which is where it will actually get used — nobody
 * navigates to a page to boost something; they finish a post and want it seen.
 *
 * **It offers a choice now.** The first cut inferred one power from the post's
 * age, which was right while Boost and Second Wind were the only two — they
 * split one job by age. There are six, and four have nothing to do with age, so
 * inferring would silently hide most of what a holder has paid for. The age
 * rule survives where it belongs: Boost and Second Wind stay mutually
 * exclusive and only the one that suits the post is listed, because the server
 * refuses the other and they cost the same boost.
 *
 * **The server is the authority on what is spendable.** `status.powers` says
 * what is unlocked and what is built; nothing here keeps its own table. The
 * client draws a badge from a live wallet read that deliberately over-reports,
 * so a local answer would offer powers the server will refuse.
 *
 * **The copy never promises the top spot outright.** The slot rotates, weighted
 * by tier — the holder is buying a window and a share of voice inside it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getNFTInfo } from '@/lib/api/dehub';
import {
  Loader2,
  Rocket,
  History,
  Lock,
  Shield,
  Crosshair,
  Target,
  Check,
  Siren,
  Radio,
  Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { badgeImage } from '@/lib/staking-badges';
import {
  useBookBoost,
  useSuperpowerLadder,
  useSuperpowers,
  spendablePowers,
} from '@/hooks/use-superpowers';
import type { SuperPowerKey } from '@/lib/api/dehub/superpowers';

interface BoostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string | number;
  postTitle?: string;
}

const ICONS: Partial<Record<SuperPowerKey, typeof Rocket>> = {
  boost: Rocket,
  second_wind: History,
  timeline_bomber: Radio,
  signal_flare: Siren,
  flak_jacket: Shield,
  precision_strike: Crosshair,
  harpoon: Target,
  deep_current: Gift,
};

export function BoostModal({ open, onOpenChange, tokenId, postTitle }: BoostModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const { data: status, isLoading, isError } = useSuperpowers(open);
  const { data: ladder } = useSuperpowerLadder();
  const bookBoost = useBookBoost();

  const [chosen, setChosen] = useState<SuperPowerKey | null>(null);
  const [targetAccount, setTargetAccount] = useState('');
  const [targetTiers, setTargetTiers] = useState<string[]>([]);

  // The post's real timestamp, fetched rather than taken from the card.
  // `TextPost.createdAt` is already formatted for display ("2h ago") by the
  // feed mappers, so it cannot be read as a date — and getting the age wrong
  // here means offering the wrong half of the Boost/Second Wind pair.
  const { data: postInfo } = useQuery({
    queryKey: ['pinned-post', String(tokenId ?? '')],
    queryFn: () => getNFTInfo(String(tokenId)),
    enabled: open && !!tokenId,
    staleTime: 5 * 60 * 1000,
  });

  // Whether this post is the viewer's own decides which HALF of the ladder is
  // spendable on it: a gift only lands on somebody else's, everything else
  // only on your own. Left undefined until the author is known, so a slow
  // lookup shows the full list rather than the wrong half of it.
  const isOwnPost = useMemo(() => {
    const author = postInfo?.minter?.toLowerCase();
    const me = walletAddress?.toLowerCase();
    if (!author || !me) return undefined;
    return author === me;
  }, [postInfo?.minter, walletAddress]);

  const powers = useMemo(
    () => spendablePowers(status, postInfo?.createdAt, isOwnPost),
    [status, postInfo?.createdAt, isOwnPost],
  );

  // Default to the first one they can actually spend, so the common case is
  // one tap. Re-runs when the list arrives, and resets between openings.
  useEffect(() => {
    if (!open) {
      setChosen(null);
      setTargetAccount('');
      setTargetTiers([]);
      return;
    }
    if (chosen) return;
    setChosen(powers.find(p => p.enabled)?.key ?? powers[0]?.key ?? null);
  }, [open, powers, chosen]);

  const active = powers.find(p => p.key === chosen);
  const numericTokenId = Number(tokenId);

  const targetingSatisfied =
    active?.targeting === 'account'
      ? targetAccount.trim().length > 0
      : active?.targeting === 'tiers'
        ? targetTiers.length > 0
        : true;

  const canBook =
    !!status && !!active?.enabled && targetingSatisfied && Number.isFinite(numericTokenId);

  const badgeArt = badgeImage(status?.tier);
  const tierNames = (ladder?.tiers ?? []).map(row => row.name).filter(Boolean) as string[];

  const handleBoost = () => {
    if (!canBook || !chosen) return;
    bookBoost.mutate(
      {
        tokenId: numericTokenId,
        power: chosen,
        targetAccount: active?.targeting === 'account' ? targetAccount.trim() : undefined,
        targetTiers: active?.targeting === 'tiers' ? targetTiers : undefined,
      },
      {
        onSuccess: booking => {
          toast.success(
            t('superpowers.spent', {
              power: active?.label ?? '',
              minutes: booking.minutes,
              defaultValue: `${active?.label} running for ${booking.minutes} minutes`,
            }),
          );
          onOpenChange(false);
        },
        // The server writes these sentences for a person to read — "That post
        // is over a week old", "That account is private and cannot be
        // targeted". Show its words rather than a generic failure.
        onError: (error: any) => toast.error(error?.message || t('superpowers.boostFailed')),
      },
    );
  };

  const refillsOn = status?.cycleEndsAt
    ? new Date(status.cycleEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-6">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-white text-lg flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            {t('superpowers.title')}
          </DrawerTitle>
        </DrawerHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : isError ? (
          // A failed request is not the same as no badge. Telling a Meglodon to
          // go and stake because the API blipped is worse than saying nothing.
          <div className="flex flex-col gap-3 py-6 text-center">
            <p className="text-white text-sm">{t('superpowers.loadFailed')}</p>
          </div>
        ) : !status?.tier ? (
          <div className="flex flex-col gap-4 py-4 text-center">
            <Lock className="w-8 h-8 mx-auto text-zinc-500" />
            <p className="text-white text-sm">{t('superpowers.needBadge')}</p>
            <Button variant="outline" onClick={() => { onOpenChange(false); navigate('/app/stake'); }}>
              {t('superpowers.stakeDhb')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2 max-h-[70vh] overflow-y-auto">
            {postTitle && <p className="text-xs text-zinc-400 line-clamp-2 px-1">{postTitle}</p>}

            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4">
              {badgeArt && <img src={badgeArt} alt={status.tier} className="w-9 h-9 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium">{status.tier}</p>
                <p className="text-[12px] text-zinc-400">
                  {t('superpowers.boostsLeft', {
                    left: status.boostsLeft,
                    total: status.boostsPerCycle,
                    defaultValue: `${status.boostsLeft} of ${status.boostsPerCycle} boosts left`,
                  })}
                  {refillsOn
                    ? ` · ${t('superpowers.refills', { date: refillsOn, defaultValue: `refills ${refillsOn}` })}`
                    : ''}
                </p>
              </div>
              <span className="text-right shrink-0">
                <span className="block text-white text-lg font-semibold tabular-nums">
                  {status.minutesPerBoost}
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                  {t('superpowers.minutes')}
                </span>
              </span>
            </div>

            {/* The chooser. Locked rungs are shown rather than hidden — seeing
                what the next tier buys is the reason to climb to it. */}
            <div className="flex flex-col gap-1.5">
              {powers.map(power => {
                const Icon = ICONS[power.key] ?? Rocket;
                const isChosen = power.key === chosen;
                return (
                  <button
                    key={power.key}
                    type="button"
                    onClick={() => power.enabled && setChosen(power.key)}
                    disabled={!power.enabled}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      isChosen
                        ? 'border-white/30 bg-white/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/5',
                      !power.enabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-zinc-300" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-white">{power.label}</span>
                        {isChosen && power.enabled && (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        )}
                      </span>
                      <span className="block text-[12px] text-zinc-500 leading-snug">
                        {power.blockedReason || power.summary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Targeting, only for the power that needs it. */}
            {active?.targeting === 'account' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-zinc-400 px-1">
                  {t('superpowers.aimAtAccount')}
                </label>
                <Input
                  value={targetAccount}
                  onChange={e => setTargetAccount(e.target.value)}
                  placeholder={t('superpowers.aimPlaceholder')}
                  className="bg-white/5 border-white/10"
                />
              </div>
            )}

            {active?.targeting === 'tiers' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-zinc-400 px-1">
                  {t('superpowers.aimAtTiers')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {tierNames.map(name => {
                    const picked = targetTiers.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setTargetTiers(prev =>
                            prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name],
                          )
                        }
                        className={cn(
                          'rounded-full border px-3 py-1 text-[12px] transition-colors',
                          picked
                            ? 'border-white/40 bg-white/15 text-white'
                            : 'border-white/10 text-zinc-400 hover:bg-white/5',
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The honest sentence. The slot rotates and a higher tier is dealt
                more often, so what is bought is a window plus a share of voice
                — never sole possession of the top of the feed. */}
            <p className="text-[12px] text-zinc-500 px-1">{t('superpowers.shareOfVoice')}</p>

            <Button
              onClick={handleBoost}
              disabled={!canBook || bookBoost.isPending}
              className={cn('w-full', !canBook && 'opacity-50')}
            >
              {bookBoost.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : !active?.enabled && active?.blockedReason ? (
                // The reason the chosen power cannot be spent, rather than a
                // flat "no boosts left" that is wrong for a Signal Flare — it
                // is paid for out of a second allowance, so a holder with no
                // boosts may still have flares.
                active.blockedReason
              ) : (
                t('superpowers.spendFor', {
                  power: active?.label ?? '',
                  minutes: status.minutesPerBoost,
                  defaultValue: `${active?.label ?? 'Spend'} for ${status.minutesPerBoost} minutes`,
                })
              )}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

export default BoostModal;
