/**
 * "Badge delegation" from somebody else's profile.
 *
 * Same two actions as the settings panel — lend a badge, take it back — but
 * with the recipient already decided: the profile you are standing on. Settings
 * is where you see every loan at once; this is where you act on one person
 * without having to copy their address out of the page first.
 *
 * Deliberately a swap-in-place list rather than a nested dialog, for the same
 * reason CopyAddressRows is: this lives inside a drawer already, and an overlay
 * opened from another overlay dismisses its own parent.
 *
 * Every string here is a settings.badgeDelegation* key. The wording is the same
 * wording, and reusing it keeps the two surfaces from drifting apart in 110
 * locales.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { badgeImage } from '@/lib/staking-badges';
import {
  useBadgeDelegations,
  useGrantDelegation,
  useRevokeDelegation,
} from '@/hooks/use-badge-delegations';

interface LendBadgeRowsProps {
  /** Wallet address of the profile being viewed — the recipient. */
  address: string;
  /** Shown above the actions so it is obvious who this lends to. */
  handle: string;
  onBack: () => void;
  /** Called after a successful grant or revoke — usually to close the menu. */
  onDone: () => void;
}

export function LendBadgeRows({ address, handle, onBack, onDone }: LendBadgeRowsProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();

  const grantableTiers = data?.grantableTiers?.length
    ? data.grantableTiers
    : data?.grantableTier
      ? [data.grantableTier]
      : [];
  const ceiling = data?.grantableTier ?? null;
  const [tier, setTier] = useState<string | null>(ceiling);
  useEffect(() => {
    setTier(ceiling);
  }, [ceiling]);

  const target = address?.toLowerCase();
  const lentToThem = data?.granted.find(entry => entry.address.toLowerCase() === target) ?? null;
  const slotsFree = data ? Math.max(0, data.slots - data.slotsUsed) : 0;
  const canGrant = Boolean(data?.grantableTier) && slotsFree > 0;

  return (
    <div className="space-y-1">
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-1 py-2 text-white/60 hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-sm font-medium">{t('settings.badgeDelegation')}</span>
      </button>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-white/60">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('settings.badgeDelegationLoading')}
        </div>
      ) : lentToThem ? (
        <>
          <p className="px-3 py-2 text-sm leading-5 text-white/60">
            {t('settings.badgeDelegationGranted', { to: handle, tier: lentToThem.tier })}
          </p>
          <button
            onClick={() => revoke.mutate(lentToThem.address, { onSuccess: onDone })}
            disabled={revoke.isPending}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-[background-color,transform] text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-xl bg-red-500/20 backdrop-blur-sm flex items-center justify-center">
              {revoke.isPending ? (
                <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
              ) : (
                <img src={badgeImage(lentToThem.tier) ?? undefined} alt="" className="w-4 h-4 art-rim" />
              )}
            </div>
            <span className="text-red-400 font-medium">{t('settings.badgeDelegationHandBack')}</span>
          </button>
        </>
      ) : !data.grantableTier ? (
        <p className="px-3 py-3 text-sm leading-5 text-white/60">
          {t('settings.badgeDelegationNoBadge')}
        </p>
      ) : (
        <>
          <p className="px-3 py-2 text-sm leading-5 text-white/60">
            {t('settings.badgeDelegationSlots', {
              count: data.slots,
              tier: data.ownTier ?? data.grantableTier,
              free: slotsFree,
            })}{' '}
            {t('settings.badgeDelegationRaisesOnlyTier')}
          </p>

          {grantableTiers.length > 1 && (
            <div className="px-3 pb-1">
              <p className="pb-2 text-xs uppercase tracking-wide text-white/40">
                {t('settings.badgeDelegationPickTier')}
              </p>
              <div
                role="radiogroup"
                aria-label={t('settings.badgeDelegationPickTier')}
                className="flex flex-wrap gap-2"
              >
                {grantableTiers.map(name => {
                  const selected = name === tier;
                  const src = badgeImage(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTier(name)}
                      disabled={!canGrant || grant.isPending}
                      className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50 ${
                        selected
                          ? 'border-white bg-white text-black'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {src ? <img src={src} alt="" className="w-4 h-4 shrink-0" /> : null}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {canGrant ? (
            <button
              onClick={() =>
                grant.mutate(
                  { to: address, tier: tier && grantableTiers.includes(tier) ? tier : null },
                  { onSuccess: onDone },
                )
              }
              disabled={grant.isPending}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 active:scale-[0.98] transition-[background-color,transform] text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                {grant.isPending ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <img src={badgeImage(tier ?? '') ?? undefined} alt="" className="w-4 h-4 art-rim" />
                )}
              </div>
              <span className="text-white font-medium">
                {t('settings.badgeDelegationLend')} · {handle}
              </span>
            </button>
          ) : (
            <p className="px-3 py-2 text-sm leading-5 text-white/60">
              {t('settings.badgeDelegationFull')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
