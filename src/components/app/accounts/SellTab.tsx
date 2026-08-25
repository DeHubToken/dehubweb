/**
 * Sell Tab
 * ========
 * Put your whole account on the market, and see what you have traded.
 *
 * The thing this screen has to be blunt about, because it is irreversible and
 * not guessable from a price field: **you are selling the entire account** —
 * handle, posts, followers, tips history, badge entitlements. Your wallet and
 * everything in it (DHB, staked badge stake, minted collectibles) stays yours;
 * after the sale this wallet signs into a brand-new blank account.
 *
 * The purchases list also lives here, because a purchase can fail AFTER
 * payment — the transfer is a server-side job, and when it dies the sale row
 * carries everything needed to re-run the claim. That is the "Resume
 * transfer" button, and burying it anywhere less obvious strands paid buyers.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import dehubCoin from '@/assets/dehub-coin.png';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAccountMarketConfig,
  useCancelAccountListing,
  useCreateAccountListing,
  useMyAccountMarket,
  useResumeAccountClaim,
} from '@/hooks/use-account-market';
import { compactCount } from './AccountCard';
import type { AccountSale, MyAccountListing } from '@/lib/api/dehub/account-market';

export function SellTab() {
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const { data: config } = useAccountMarketConfig();
  const { data: mine, isLoading } = useMyAccountMarket();
  const createListing = useCreateAccountListing();
  const cancelListing = useCancelAccountListing();

  const [priceDhb, setPriceDhb] = useState('');
  const [description, setDescription] = useState('');

  const active = mine?.listings.find(l => l.status === 'active');
  const history = (mine?.listings || []).filter(l => l.status !== 'active');

  // Seed the form from an existing listing so "list" doubles as "edit".
  useEffect(() => {
    if (!active) return;
    setPriceDhb(String(active.priceDhb));
    setDescription(active.description || '');
    // Keyed on the listing id: re-seeding on every refetch would eat edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-zinc-400">Sign in to put your account on the market.</p>
        <Button onClick={() => openLoginModal()}>Sign in</Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-40 rounded-xl bg-white/5 animate-pulse" />;
  }

  const username = user?.username || null;
  if (!username) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
        Set a username on your profile before you can sell your account.{' '}
        <a href="/app/settings" className="underline">Settings → Profile</a>
      </div>
    );
  }

  const avatar = walletAddress
    ? buildAvatarUrl(walletAddress, user?.avatarImageUrl || user?.avatarUrl || null)
    : null;
  const followers = typeof user?.followers === 'number' ? user.followers : user?.followersList?.length ?? 0;

  const priceNumber = Math.floor(Number(priceDhb));
  const priceValid =
    Number.isFinite(priceNumber) &&
    priceNumber >= (config?.minPriceDhb ?? 1000) &&
    priceNumber <= (config?.maxPriceDhb ?? Number.MAX_SAFE_INTEGER);
  const canSubmit = priceValid && !createListing.isPending;

  const submit = () => {
    createListing.mutate({
      priceDhb: priceNumber,
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* The listing form, which doubles as the editor for a live listing. */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
          ) : (
            <span className="w-11 h-11 rounded-full bg-white/10 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">You are selling your whole account</p>
            <p className="text-xl font-bold text-white break-all">
              <span className="text-zinc-500">@</span>{username}
            </p>
            <p className="text-[11px] text-zinc-500">{compactCount(followers)} followers</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-400">Asking price in DHB</Label>
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
              ? `≈ $${(priceNumber * config.dhbUsdPeg).toLocaleString(undefined, { maximumFractionDigits: 2 })}. The buyer pays you directly — DeHub takes no cut.`
              : `Between ${(config?.minPriceDhb ?? 1000).toLocaleString()} and ${(config?.maxPriceDhb ?? 0).toLocaleString()} DHB.`}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-zinc-400">Pitch (optional)</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={config?.maxDescriptionLength ?? 280}
            rows={2}
            placeholder="Established 2021 account, active audience…"
            className="bg-black/60 border-white/10 rounded-xl text-white resize-none"
          />
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-100">
            A sale is final and moves everything — handle, posts, followers, tips history and badge
            entitlements. Your wallet and what is in it (DHB, staked badges, minted collectibles) stays
            yours; afterwards this wallet signs into a brand-new blank account. Payment goes straight to
            you — DeHub takes no cut.
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!canSubmit} onClick={submit}>
            {createListing.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {active ? 'Update listing' : 'List for sale'}
          </Button>
          {active && (
            <Button
              variant="outline"
              size="icon"
              disabled={cancelListing.isPending}
              onClick={() => cancelListing.mutate(active.id)}
              title="Withdraw listing"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {((mine?.sold.length ?? 0) > 0 || (mine?.bought.length ?? 0) > 0 || history.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">History</h2>
          {mine!.sold.map(sale => <SaleRow key={sale.id} sale={sale} kind="sold" />)}
          {mine!.bought.map(sale => <SaleRow key={sale.id} sale={sale} kind="bought" />)}
          {history.map(listing => <HistoryRow key={listing.id} listing={listing} />)}
        </div>
      )}
    </div>
  );
}

function SaleRow({ sale, kind }: { sale: AccountSale; kind: 'sold' | 'bought' }) {
  const resume = useResumeAccountClaim();
  const failed = kind === 'bought' && sale.status === 'failed';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white break-all">
            <span className="text-zinc-500">@</span>{sale.username}
          </p>
          <p className="text-[11px] text-zinc-500">
            {kind === 'sold'
              ? 'Sold'
              : sale.status === 'completed'
                ? 'Bought'
                : sale.status === 'transferring'
                  ? 'Bought — transfer in progress'
                  : 'Bought — transfer failed'}
            {failed && sale.failureReason ? ` · ${sale.failureReason}` : ''}
          </p>
        </div>
        <p className="text-sm font-semibold text-white flex items-center gap-1.5 shrink-0">
          <img src={dehubCoin} alt="DHB" className="w-4 h-4" />
          {sale.paidDhb.toLocaleString()}
        </p>
      </div>

      {/* Payment already left this buyer's wallet; the claim is idempotent and
          resumes the interrupted transfer server-side. */}
      {failed && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={resume.isPending}
          onClick={() =>
            resume.mutate({
              listingId: sale.id,
              txHash: sale.txHash,
              chainId: sale.chainId,
              receiveAddress: sale.receiveAddress || undefined,
            })
          }
        >
          {resume.isPending
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <RotateCcw className="w-4 h-4 mr-2" />}
          Resume transfer
        </Button>
      )}
    </div>
  );
}

function HistoryRow({ listing }: { listing: MyAccountListing }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-zinc-300 break-all">
          <span className="text-zinc-500">@</span>{listing.username}
        </p>
        <p className="text-[11px] text-zinc-500">
          {listing.status === 'cancelled' ? listing.cancelReason || 'Withdrawn' : 'Sold'}
        </p>
      </div>
      <p className="text-xs text-zinc-500 shrink-0">{listing.priceDhb.toLocaleString()} DHB</p>
    </div>
  );
}
