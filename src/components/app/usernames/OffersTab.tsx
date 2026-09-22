/**
 * Offers Tab
 * ==========
 * Bids for the handle you are wearing, and bids you have made for other
 * people's.
 *
 * The screen has one job beyond listing rows, and it is a copy job: at every
 * step it has to say what has **not** happened yet. An offer takes no money.
 * Accepting one takes no money and moves no handle — it holds your name for
 * one buyer until they pay, and you can take that back. Every state here that
 * looks like a completed trade is actually a promise, and a reader who thinks
 * otherwise will either spend a name they still own or wait for DHB that was
 * never sent.
 *
 * Paying for an accepted offer reuses the ordinary buy drawer. An accepted
 * offer is a listing reserved for one address, so there is nothing to build: a
 * row is shaped into the listing it already is and handed over, which also
 * means the buyer gets the same "you are giving up @you" warning a shop-window
 * purchase gives them.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DhbCoin } from '@/components/app/DhbAmount';
import { useAuth } from '@/contexts/AuthContext';
import { useMyUsernameMarket, useUsernameMarketConfig } from '@/hooks/use-username-market';
import {
  useAcceptUsernameOffer,
  useDeclineUsernameOffer,
  useMyUsernameOffers,
  useWithdrawUsernameOffer,
} from '@/hooks/use-username-offers';
import type { UsernameOffer } from '@/lib/api/dehub/username-offers';
import type { UsernameListing } from '@/lib/api/dehub/username-market';
import { BuyUsernameDrawer } from './BuyUsernameDrawer';

export function OffersTab() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { data, isLoading } = useMyUsernameOffers();
  const [paying, setPaying] = useState<UsernameListing | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-zinc-400">{t('usernames.signInForOffers')}</p>
        <Button onClick={() => openLoginModal()}>{t('usernames.signIn')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-40 rounded-xl bg-white/5 animate-pulse" />;
  }

  const incoming = data?.incoming.filter(isLive) ?? [];
  const outgoing = data?.outgoing.filter(isLive) ?? [];
  const past = [...(data?.incoming ?? []), ...(data?.outgoing ?? [])].filter(o => !isLive(o));

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">{t('usernames.offersForYou')}</h2>
        {incoming.length === 0 ? (
          <EmptyNote text={t('usernames.noIncomingOffers')} />
        ) : (
          incoming.map(offer => <IncomingRow key={offer.id} offer={offer} />)
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">{t('usernames.offersYouMade')}</h2>
        {outgoing.length === 0 ? (
          <EmptyNote text={t('usernames.noOutgoingOffers')} />
        ) : (
          outgoing.map(offer => (
            <OutgoingRow key={offer.id} offer={offer} onPay={() => setPaying(asListing(offer))} />
          ))
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">{t('usernames.offerHistory')}</h2>
          {past.map(offer => <PastRow key={offer.id} offer={offer} />)}
        </section>
      )}

      <BuyUsernameDrawer listing={paying} open={!!paying} onClose={() => setPaying(null)} />
    </div>
  );
}

/** Still actionable by somebody. Everything else is history. */
function isLive(offer: UsernameOffer) {
  return offer.status === 'pending' || offer.status === 'accepted';
}

/**
 * An accepted offer, shaped into the listing it already is on the server.
 *
 * Not a fake: `listingId` names a real reserved listing, and the buy drawer
 * re-quotes it from the server before anybody can pay. The fields here are
 * only what the drawer renders while that quote is in flight.
 */
function asListing(offer: UsernameOffer): UsernameListing | null {
  if (!offer.listingId) return null;
  return {
    id: offer.listingId,
    username: offer.username,
    priceDhb: offer.priceDhb,
    priceUsd: offer.priceUsd,
    description: null,
    length: offer.username.length,
    isNumeric: /^[0-9]+$/.test(offer.username),
    seller: {
      address: offer.ownerAddress,
      displayName: offer.counterparty?.displayName ?? null,
      avatarUrl: offer.counterparty?.avatarUrl ?? null,
      badgeBalance: offer.counterparty?.badgeBalance ?? 0,
    },
    createdAt: offer.createdAt,
  };
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-500">{text}</div>
  );
}

function Money({ offer }: { offer: UsernameOffer }) {
  return (
    <p className="text-sm font-semibold text-white shrink-0 text-right">
      ${offer.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      <span className="block text-[11px] font-normal text-zinc-500">
        <DhbCoin /> {offer.priceDhb.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </p>
  );
}

function Who({ offer }: { offer: UsernameOffer }) {
  const name = offer.counterparty?.username || offer.counterparty?.displayName;
  return (
    <span className="text-zinc-400">
      {name ? `@${name}` : `${offer.counterparty?.address.slice(0, 6)}…${offer.counterparty?.address.slice(-4)}`}
    </span>
  );
}

// ── Incoming ────────────────────────────────────────────────────────────────

function IncomingRow({ offer }: { offer: UsernameOffer }) {
  const { t } = useTranslation();
  const { data: config } = useUsernameMarketConfig();
  const { data: mine } = useMyUsernameMarket();
  const accept = useAcceptUsernameOffer();
  const decline = useDeclineUsernameOffer();

  const [answering, setAnswering] = useState(false);
  const [replacement, setReplacement] = useState('');

  const replacementValid =
    /^[a-z0-9_-]{1,30}$/.test(replacement.trim().toLowerCase()) &&
    replacement.trim().toLowerCase() !== offer.username;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white break-all">
            <span className="text-zinc-500">@</span>
            {offer.username}
          </p>
          <p className="text-[11px] text-zinc-500">
            <Who offer={offer} /> · {t('usernames.offerExpires', { when: relative(offer.expiresAt) })}
          </p>
        </div>
        <Money offer={offer} />
      </div>

      {offer.message && (
        <p className="text-xs text-zinc-300 rounded-lg bg-black/40 p-2 break-words">{offer.message}</p>
      )}

      {offer.status === 'accepted' ? (
        <div className="space-y-2">
          {/* The single most misreadable state on the page: the owner has said
              yes, still holds the handle, and is owed nothing until the buyer
              pays. Said plainly rather than as a status chip. */}
          <p className="text-[11px] text-amber-100 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
            {t('usernames.acceptedAwaitingPayment', { handle: offer.replacementUsername || '' })}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={decline.isPending}
            onClick={() => decline.mutate(offer.id)}
          >
            {decline.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
            {t('usernames.withdrawAcceptance')}
          </Button>
        </div>
      ) : answering ? (
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">{t('usernames.newHandleWhenSold')}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
            <Input
              value={replacement}
              onChange={e => setReplacement(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toLowerCase())}
              spellCheck={false}
              autoCapitalize="none"
              maxLength={config?.usernameMaxLength ?? 30}
              placeholder={`${mine?.currentUsername || offer.username}_2`.slice(0, 30)}
              className="pl-7 bg-black/60 border-white/10 rounded-xl text-white"
            />
          </div>
          <p className="text-[11px] text-zinc-500">{t('usernames.acceptMovesNothingYet')}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={!replacementValid || accept.isPending}
              onClick={() =>
                accept.mutate({ offerId: offer.id, replacementUsername: replacement.trim().toLowerCase() })
              }
            >
              {accept.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('usernames.confirmAccept')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnswering(false)}>
              {t('usernames.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setAnswering(true)}>
            <Check className="w-4 h-4 mr-2" />
            {t('usernames.acceptOffer')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={decline.isPending}
            onClick={() => decline.mutate(offer.id)}
          >
            {decline.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
            {t('usernames.declineOffer')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Outgoing ────────────────────────────────────────────────────────────────

function OutgoingRow({ offer, onPay }: { offer: UsernameOffer; onPay: () => void }) {
  const { t } = useTranslation();
  const withdraw = useWithdrawUsernameOffer();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white break-all">
            <span className="text-zinc-500">@</span>
            {offer.username}
          </p>
          <p className="text-[11px] text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {offer.status === 'accepted'
              ? t('usernames.payBefore', { when: relative(offer.expiresAt) })
              : t('usernames.awaitingOwner')}
          </p>
        </div>
        <Money offer={offer} />
      </div>

      {offer.status === 'accepted' && (
        <p className="text-[11px] text-emerald-100 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
          {t('usernames.offerAcceptedPayNow')}
        </p>
      )}

      <div className="flex gap-2">
        {offer.status === 'accepted' && (
          <Button size="sm" className="flex-1" onClick={onPay}>
            {t('usernames.payAndClaim')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={offer.status === 'accepted' ? '' : 'flex-1'}
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate(offer.id)}
        >
          {withdraw.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2" />
          )}
          {t('usernames.withdrawOffer')}
        </Button>
      </div>
    </div>
  );
}

function PastRow({ offer }: { offer: UsernameOffer }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-zinc-300 break-all">
          <span className="text-zinc-500">@</span>
          {offer.username}
        </p>
        <p className="text-[11px] text-zinc-500">{t(`usernames.offerStatus.${offer.status}`)}</p>
      </div>
      <p className="text-xs text-zinc-500 shrink-0">
        ${offer.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

/**
 * "in 6 days", in the reader's own language.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled table because this page
 * ships in 110 locales and a bespoke "d/h/m" is only ever right in one.
 */
function relative(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '';
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const days = Math.round(ms / 86_400_000);
  if (Math.abs(days) >= 1) return fmt.format(days, 'day');
  const hours = Math.round(ms / 3_600_000);
  if (Math.abs(hours) >= 1) return fmt.format(hours, 'hour');
  return fmt.format(Math.round(ms / 60_000), 'minute');
}
