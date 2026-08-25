/**
 * Boost Modal
 * ===========
 * Spending one of a badge holder's boosts on a post. Opened from the post's
 * options drawer, which is where it will actually get used — nobody navigates
 * to a page to boost something; they finish a post and want it seen.
 *
 * Two decisions worth keeping:
 *
 * **The power is chosen by the post's age, not by the holder.** Boost is for
 * anything under a week; Second Wind is for the archive and unlocks a rung
 * higher. Offering both as a choice would just be a quiz about a rule the
 * server is going to enforce anyway, so the sheet reads the age, picks, and
 * says which one it picked.
 *
 * **The copy never promises the top spot outright.** The slot rotates, weighted
 * by tier — the holder is buying a window in the slot and a share of voice
 * inside it, and the honest sentence is the one that survives the day two
 * whales boost at once.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getNFTInfo } from '@/lib/api/dehub';
import { Loader2, Rocket, History, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useBookBoost, useSuperpowers, powerForPostAge } from '@/hooks/use-superpowers';

interface BoostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId?: string | number;
  postTitle?: string;
}

export function BoostModal({ open, onOpenChange, tokenId, postTitle }: BoostModalProps) {
  const { t } = useTranslation();
  const { data: status, isLoading } = useSuperpowers();
  const bookBoost = useBookBoost();
  const navigate = useNavigate();

  // The post's real timestamp, fetched rather than taken from the card.
  // `TextPost.createdAt` is already formatted for display ("2h ago") by the
  // feed mappers, so it cannot be read as a date — and getting the age wrong
  // here means offering the wrong power and eating a refusal. One cached
  // request when the sheet opens is the cheaper mistake.
  const { data: postInfo } = useQuery({
    queryKey: ['pinned-post', String(tokenId ?? '')],
    queryFn: () => getNFTInfo(String(tokenId)),
    enabled: open && !!tokenId,
    staleTime: 5 * 60 * 1000,
  });

  const power = useMemo(() => powerForPostAge(postInfo?.createdAt), [postInfo?.createdAt]);
  const powerInfo = status?.powers.find(p => p.key === power);

  const numericTokenId = Number(tokenId);
  const canBook =
    !!status &&
    !!powerInfo?.unlocked &&
    !!powerInfo?.available &&
    status.boostsLeft > 0 &&
    Number.isFinite(numericTokenId);

  const badgeUrl = status?.tier ? getBadgeUrl(status.badgeBalance) : null;

  const handleBoost = () => {
    if (!canBook || !power) return;
    bookBoost.mutate(
      { tokenId: numericTokenId, power },
      {
        onSuccess: booking => {
          toast.success(
            t('superpowers.boostBooked', {
              minutes: booking.minutes,
              defaultValue: `Boosted for ${booking.minutes} minutes`,
            }),
          );
          onOpenChange(false);
        },
        // The server writes these sentences for a person to read — "That post
        // is over a week old", "You have used all 2 of your boosts this cycle".
        // Show its words rather than a generic failure.
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
            {power === 'second_wind' ? <History className="w-5 h-5" /> : <Rocket className="w-5 h-5" />}
            {power === 'second_wind' ? t('superpowers.secondWind') : t('superpowers.boost')}
          </DrawerTitle>
        </DrawerHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : !status?.tier ? (
          // No badge at all. Not an error — an invitation, with the one thing
          // they can do about it.
          <div className="flex flex-col gap-4 py-4 text-center">
            <Lock className="w-8 h-8 mx-auto text-zinc-500" />
            <p className="text-white text-sm">{t('superpowers.needBadge')}</p>
            <Button variant="outline" onClick={() => { onOpenChange(false); navigate('/app/stake'); }}>
              {t('superpowers.stakeDhb')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {postTitle && (
              <p className="text-xs text-zinc-400 line-clamp-2 px-1">{postTitle}</p>
            )}

            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4">
              {badgeUrl && <img src={badgeUrl} alt={status.tier} className="w-9 h-9 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium">{status.tier}</p>
                <p className="text-[12px] text-zinc-400">
                  {t('superpowers.boostsLeft', {
                    left: status.boostsLeft,
                    total: status.boostsPerCycle,
                    defaultValue: `${status.boostsLeft} of ${status.boostsPerCycle} boosts left`,
                  })}
                  {refillsOn ? ` · ${t('superpowers.refills', { date: refillsOn, defaultValue: `refills ${refillsOn}` })}` : ''}
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

            <p className="text-[13px] text-zinc-400 px-1">
              {power === 'second_wind'
                ? t('superpowers.secondWindExplainer')
                : t('superpowers.boostExplainer')}
            </p>

            {/* The honest sentence. The slot rotates and a higher tier is dealt
                more often, so the thing being bought is a window plus a share
                of voice — never sole possession of the top of the feed. */}
            <p className="text-[12px] text-zinc-500 px-1">
              {t('superpowers.shareOfVoice')}
            </p>

            {powerInfo && !powerInfo.unlocked && (
              <p className="text-[13px] text-yellow-500/90 px-1">
                {t('superpowers.unlocksAt', {
                  power: powerInfo.label,
                  tier: powerInfo.tier,
                  defaultValue: `${powerInfo.label} unlocks at ${powerInfo.tier}`,
                })}
              </p>
            )}

            <Button
              onClick={handleBoost}
              disabled={!canBook || bookBoost.isPending}
              className={cn('w-full', !canBook && 'opacity-50')}
            >
              {bookBoost.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status.boostsLeft < 1 ? (
                t('superpowers.noBoostsLeft')
              ) : (
                t('superpowers.boostForMinutes', {
                  minutes: status.minutesPerBoost,
                  defaultValue: `Boost for ${status.minutesPerBoost} minutes`,
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
