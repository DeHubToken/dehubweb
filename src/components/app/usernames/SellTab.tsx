/**
 * Sell Tab
 * ========
 * List the handle you are wearing, and see what you have traded.
 *
 * Two things this screen has to be blunt about, because both are irreversible
 * and neither is guessable from a price field:
 *
 * - **You are selling the handle you are currently using.** There is no picker;
 *   the form shows your own name and that is what goes on the market.
 * - **You have to say where you are going.** The replacement handle is chosen
 *   here, while you are sitting in front of it, rather than being invented for
 *   you at the moment somebody pays. It is checked against the same rules
 *   Settings enforces, so a listing can never promise a swap that would fail.
 */

import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { DhbCoin } from '@/components/app/DhbAmount';
import { AlertTriangle, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import dehubCoin from '@/assets/dehub-coin.png';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCancelUsernameListing,
  useCreateUsernameListing,
  useMyUsernameMarket,
  useUsernameMarketConfig,
} from '@/hooks/use-username-market';
import type { MyUsernameListing, UsernameSale } from '@/lib/api/dehub/username-market';

export function SellTab() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const { data: config } = useUsernameMarketConfig();
  const { data: mine, isLoading } = useMyUsernameMarket();
  const createListing = useCreateUsernameListing();
  const cancelListing = useCancelUsernameListing();

  const [priceDhb, setPriceDhb] = useState('');
  const [replacement, setReplacement] = useState('');
  const [description, setDescription] = useState('');

  const active = mine?.listings.find(l => l.status === 'active');
  const history = (mine?.listings || []).filter(l => l.status !== 'active');

  // Seed the form from an existing listing so "list" doubles as "edit".
  useEffect(() => {
    if (!active) return;
    setPriceDhb(String(active.priceDhb));
    setReplacement(active.replacementUsername);
    setDescription(active.description || '');
  }, [active?.id]);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-zinc-400">{t('usernames.signInToSell')}</p>
        <Button onClick={() => openLoginModal()}>{t('usernames.signIn')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-40 rounded-xl bg-white/5 animate-pulse" />;
  }

  if (!mine?.currentUsername) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
        <Trans
          i18nKey="usernames.setUsernameFirst"
          components={{ settings: <a href="/app/settings" className="underline" /> }}
        />
      </div>
    );
  }

  const priceNumber = Math.floor(Number(priceDhb));
  const priceValid =
    Number.isFinite(priceNumber) &&
    priceNumber >= (config?.minPriceDhb ?? 1000) &&
    priceNumber <= (config?.maxPriceDhb ?? Number.MAX_SAFE_INTEGER);
  const replacementValid = /^[a-z0-9_-]{1,30}$/.test(replacement.trim().toLowerCase());
  const canSubmit = priceValid && replacementValid && !createListing.isPending;

  const submit = () => {
    createListing.mutate({
      priceDhb: priceNumber,
      replacementUsername: replacement.trim().toLowerCase(),
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* The listing form, which doubles as the editor for a live listing. */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div>
          <p className="text-xs text-zinc-500">{t('usernames.youAreSelling')}</p>
          <p className="text-xl font-bold text-white break-all">
            <span className="text-zinc-500">@</span>{mine.currentUsername}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-400">{t('usernames.askingPriceDhb')}</Label>
          <div className="relative">
            <img src={dehubCoin} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
            <Input
              value={priceDhb}
              onChange={e => setPriceDhb(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder={String(config?.minPriceDhb ?? 1000)}
              className="pl-9 bg-black/60 border-white/10 rounded-xl text-white"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            {priceValid && config
              ? t('usernames.priceApprox', {
                  usd: (priceNumber * config.dhbUsdPeg).toLocaleString(undefined, { maximumFractionDigits: 2 }),
                })
              : t('usernames.priceRange', {
                  min: (config?.minPriceDhb ?? 1000).toLocaleString(),
                  max: (config?.maxPriceDhb ?? 0).toLocaleString(),
                })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-400">{t('usernames.newHandleWhenSold')}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
            <Input
              value={replacement}
              onChange={e => setReplacement(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toLowerCase())}
              spellCheck={false}
              autoCapitalize="none"
              maxLength={config?.usernameMaxLength ?? 30}
              placeholder={`${mine.currentUsername}_2`.slice(0, 30)}
              className="pl-7 bg-black/60 border-white/10 rounded-xl text-white"
            />
          </div>
          <p className="text-[11px] text-zinc-500 flex items-start gap-1.5">
            <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
            {t('usernames.youBecomeHandle', { handle: replacement || '…' })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-400">{t('usernames.pitchOptional')}</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={config?.maxDescriptionLength ?? 280}
            rows={2}
            placeholder={t('usernames.pitchPlaceholder')}
            className="bg-black/60 border-white/10 rounded-xl text-white resize-none"
          />
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-100">
            {t('usernames.saleFinalWarning')}
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!canSubmit} onClick={submit}>
            {createListing.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t(active ? 'usernames.updateListing' : 'usernames.listForSale')}
          </Button>
          {active && (
            <Button
              variant="outline"
              size="icon"
              disabled={cancelListing.isPending}
              onClick={() => cancelListing.mutate(active.id)}
              title={t('usernames.withdrawListing')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {active && !active.live && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <Trans
            i18nKey="usernames.staleListingWarning"
            values={{ listed: active.username, current: mine.currentUsername }}
            components={{ handle: <span className="font-semibold" /> }}
          />
        </div>
      )}

      {(mine.sold.length > 0 || mine.bought.length > 0 || history.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">{t('usernames.history')}</h2>
          {mine.sold.map(sale => <SaleRow key={sale.id} sale={sale} kind="sold" />)}
          {mine.bought.map(sale => <SaleRow key={sale.id} sale={sale} kind="bought" />)}
          {history.map(listing => <HistoryRow key={listing.id} listing={listing} />)}
        </div>
      )}
    </div>
  );
}

function SaleRow({ sale, kind }: { sale: UsernameSale; kind: 'sold' | 'bought' }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-white break-all">
          <span className="text-zinc-500">@</span>{sale.username}
        </p>
        <p className="text-[11px] text-zinc-500">{t(kind === 'sold' ? 'usernames.sold' : 'usernames.bought')}</p>
      </div>
      <p className="text-sm font-semibold text-white flex items-center gap-1.5 shrink-0">
        <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
        {sale.paidDhb.toLocaleString()}
      </p>
    </div>
  );
}

function HistoryRow({ listing }: { listing: MyUsernameListing }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-zinc-300 break-all">
          <span className="text-zinc-500">@</span>{listing.username}
        </p>
        <p className="text-[11px] text-zinc-500">
          {listing.status === 'cancelled' ? listing.cancelReason || t('usernames.withdrawn') : t('usernames.sold')}
        </p>
      </div>
      <p className="text-xs text-zinc-500 shrink-0">{listing.priceDhb.toLocaleString()} <DhbCoin /></p>
    </div>
  );
}
