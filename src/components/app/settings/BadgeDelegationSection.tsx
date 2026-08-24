/**
 * Badge delegation — lending your tier to other accounts
 * ======================================================
 * Rendered in Settings → Assets, under the wallet rows, because a badge is
 * bought with DHB and this is where the rest of that lives.
 *
 * What the panel has to make obvious, because none of it is guessable:
 *
 * - You get **one slot per rung climbed**, not one slot flat.
 * - What you hand out is **your own tier** — the person you lend to wears the
 *   badge you wear.
 * - A returned slot is not free straight away.
 *
 * A lent badge draws identically to an earned one everywhere else on the site,
 * which is the whole point — it is the same influence. This panel and the
 * patron line on a profile are the only two places that say otherwise.
 */
import { useState } from 'react';
import { Award, Loader2, X } from 'lucide-react';
import { badgeImage } from '@/lib/staking-badges';
import { useBadgeDelegations, useGrantDelegation, useRevokeDelegation } from '@/hooks/use-badge-delegations';
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
          aria-label={`End delegation with ${entry.address}`}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
        >
          {ending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function BadgeDelegationSection() {
  const { data, isLoading } = useBadgeDelegations();
  const grant = useGrantDelegation();
  const revoke = useRevokeDelegation();
  const [recipient, setRecipient] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="size-4 animate-spin" />
        Loading delegations…
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
      <div className="flex items-center gap-3">
        <Award className="size-5 text-zinc-400" />
        <h3 className="font-semibold text-white">Badge delegation</h3>
      </div>

      <p className="text-sm leading-5 text-zinc-500">
        {data.ownTier ? (
          <>
            Your {data.ownTier} badge carries{' '}
            <span className="text-white">
              {data.slots} slot{data.slots === 1 ? '' : 's'}
            </span>
            , {slotsFree} free. Each one lends another account{' '}
            <span className="text-white">your own {data.grantableTier ?? data.ownTier} badge</span> —
            they wear what you wear. Take it back whenever you like; the slot frees up a day later.
          </>
        ) : (
          <>Delegation slots come with a staking badge. Stake DHB to earn one.</>
        )}
      </p>

      {data.grantableTier ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={recipient}
            onChange={event => setRecipient(event.target.value)}
            placeholder="Username or wallet address"
            aria-label="Account to lend your badge to"
            disabled={!canGrant || grant.isPending}
            className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canGrant || !recipient.trim() || grant.isPending}
            className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {grant.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Lend'}
          </button>
        </form>
      ) : null}

      {!canGrant && data.grantableTier ? (
        <p className="text-sm text-zinc-500">
          Every slot is in use. End one below, or climb a tier for another.
        </p>
      ) : null}

      {data.granted.length ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-600">Wearing your badge</p>
          {data.granted.map(entry => (
            <DelegationRow
              key={entry.address}
              entry={entry}
              label="You lent this"
              ending={revoke.isPending && revoke.variables === entry.address}
              onEnd={() => revoke.mutate(entry.address)}
            />
          ))}
        </div>
      ) : null}

      {data.received ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-600">Lent to you</p>
          <DelegationRow
            entry={data.received}
            label="Hand it back"
            ending={revoke.isPending && revoke.variables === data.received.address}
            onEnd={() => revoke.mutate(data.received!.address)}
          />
        </div>
      ) : null}
    </div>
  );
}
