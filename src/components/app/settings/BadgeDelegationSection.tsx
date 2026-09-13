/**
 * Badge delegation — lending your tier to other accounts
 * ======================================================
 * Rendered in Settings → Profile, above the profile list, because a lent badge
 * reads as identity — who is backing whom — rather than as a wallet asset.
 *
 * What the panel has to make obvious, because none of it is guessable:
 *
 * - You get **one slot per rung climbed**, not one slot flat.
 * - What you hand out is **your own tier** — the person you lend to wears the
 *   badge you wear.
 * - A returned slot is not free straight away.
 * - A loan can only ever **raise** somebody: lending a tier at or below the one
 *   they already earn is refused, because `effectiveBadgeBalance` is a max and
 *   such a loan changed nothing while still spending a slot.
 *
 * And the switch at the top, which is the answer to a question the rest of the
 * panel cannot answer: a loan applies the instant it is made, with no accept
 * step, so without a standing no the only recourse was to hand the badge back
 * afterwards — by which point it had been rendering everywhere the account
 * appears, and the lender could lend it again out of another slot.
 *
 * A lent badge draws identically to an earned one everywhere else on the site,
 * which is the whole point — it is the same influence. This panel and the
 * patron line on a profile are the only two places that say otherwise.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Loader2, X } from 'lucide-react';
import { badgeImage } from '@/lib/staking-badges';
import { Switch } from '@/components/ui/switch';
import {
  useBadgeDelegations,
  useGrantDelegation,
  useRevokeDelegation,
  useSetDelegationAcceptance,
} from '@/hooks/use-badge-delegations';
import type { DelegationEntry } from '@/lib/api/dehub/badges';

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function TierBadge({ tier }: { tier: string }) {
  const src = badgeImage(tier);
  return (
    <span className="flex items-center gap-1.5">
      {src ? <img src={src} alt="" className="size-4 shrink-0" /> : null}
      <span className="text-sm text-white">{tier}</span>
    </span>
  );
}

function DelegationRow({
  entry,
  onEnd,
  ending,
  label,
}: {
  entry: DelegationEntry;
  onEnd: () => void;
  ending: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-800 p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-sm text-white">{shortAddress(entry.address)}</span>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <TierBadge tier={entry.tier} />
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          aria-label={t('settings.badgeDelegationEnd', { address: entry.address })}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
        >
          {ending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function BadgeDelegationSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();
  const acceptance = useSetDelegationAcceptance();
  const [recipient, setRecipient] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        {t('settings.badgeDelegationLoading')}
      </div>
    );
  }

  if (!data) return null;

  const slotsFree = Math.max(0, data.slots - data.slotsUsed);
  const canGrant = Boolean(data.grantableTier) && slotsFree > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const to = recipient.trim();
    if (!to || grant.isPending) return;
    grant.mutate(to, { onSuccess: () => setRecipient('') });
  };

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-400">
        <Award className="size-4" />
        {t('settings.badgeDelegation')}
      </h3>

      {/* The standing no. First in the panel because it governs everything
          below it, and because somebody arriving here from a notification about
          a badge they did not ask for is looking for exactly this. */}
      <div className="flex items-start justify-between gap-3 rounded-xl bg-zinc-800 p-3">
        <div className="min-w-0">
          <p className="text-sm text-white">{t('settings.badgeDelegationAccept')}</p>
          <p className="mt-0.5 text-xs leading-4 text-zinc-500">
            {t('settings.badgeDelegationAcceptHint')}
          </p>
        </div>
        <Switch
          checked={data.acceptsDelegations}
          onCheckedChange={(next) => acceptance.mutate(next)}
          disabled={acceptance.isPending}
          aria-label={t('settings.badgeDelegationAccept')}
        />
      </div>

      <p className="text-sm leading-5 text-zinc-500">
        {data.ownTier ? (
          <>
            {t('settings.badgeDelegationSlots', {
              count: data.slots,
              tier: data.ownTier,
              free: slotsFree,
            })}{' '}
            {t('settings.badgeDelegationLends', { tier: data.grantableTier ?? data.ownTier })}{' '}
            {t('settings.badgeDelegationRaisesOnly')}{' '}
            {t('settings.badgeDelegationTakeBack')}
          </>
        ) : (
          <>{t('settings.badgeDelegationNoBadge')}</>
        )}
      </p>

      {data.grantableTier ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={recipient}
            onChange={event => setRecipient(event.target.value)}
            placeholder={t('settings.badgeDelegationPlaceholder')}
            aria-label={t('settings.badgeDelegationLendAria')}
            disabled={!canGrant || grant.isPending}
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canGrant || !recipient.trim() || grant.isPending}
            className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {grant.isPending ? <Loader2 className="size-4 animate-spin" /> : t('settings.badgeDelegationLend')}
          </button>
        </form>
      ) : null}

      {!canGrant && data.grantableTier ? (
        <p className="text-sm text-zinc-500">{t('settings.badgeDelegationFull')}</p>
      ) : null}

      {data.granted.length ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-600">
            {t('settings.badgeDelegationWearing')}
          </p>
          {data.granted.map(entry => (
            <DelegationRow
              key={entry.address}
              entry={entry}
              label={t('settings.badgeDelegationYouLent')}
              ending={revoke.isPending && revoke.variables === entry.address}
              onEnd={() => revoke.mutate(entry.address)}
            />
          ))}
        </div>
      ) : null}

      {data.received ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-600">
            {t('settings.badgeDelegationLentToYou')}
          </p>
          <DelegationRow
            entry={data.received}
            label={t('settings.badgeDelegationHandBack')}
            ending={revoke.isPending && revoke.variables === data.received.address}
            onEnd={() => revoke.mutate(data.received!.address)}
          />
        </div>
      ) : null}
    </div>
  );
}
