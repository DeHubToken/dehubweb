/**
 * Buy Account Drawer
 * ==================
 * The account, what it costs, where it will be delivered, and one button.
 *
 * Delivery is the part this drawer exists for. The account does not land on
 * the wallet that pays — it lands on a VACANT wallet the buyer names, one that
 * has signed in to DeHub at least once (that is how we know it is theirs).
 * The address is validated server-side BEFORE any DHB moves, and the pay
 * button stays dead until that check passes. Paying first and validating
 * later is the one ordering this screen must never allow.
 *
 * The price is quoted by the server when the drawer opens and re-quoted on
 * every open — a listing can sit in the list for days and the seller can
 * reprice it. Nothing here computes an amount.
 *
 * There is no network picker either. The payment goes out on whichever chain
 * the buyer's DHB is actually sitting on, Base first, so the drawer only
 * reports which one that is.
 */

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarClock, Check, Loader2, ShieldCheck, Share2, Upload, Users, Wallet, X } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import { useAuth } from '@/contexts/AuthContext';
import { useBuyAccount, useCheckReceiveAddress } from '@/hooks/use-account-market';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePayChain } from '@/hooks/use-pay-chain';
import { SUPPORTED_CHAINS } from '@/components/app/ChainSelector';
import { accountSince, compactCount } from './AccountCard';
import type { AccountListing, AccountQuote, ReceiveCheck } from '@/lib/api/dehub/account-market';

interface Props {
  listing: AccountListing | null;
  open: boolean;
  onClose: () => void;
}

const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;

export function BuyAccountDrawer({ listing, open, onClose }: Props) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const { getQuote, buy, stage } = useBuyAccount();
  const checkReceive = useCheckReceiveAddress();
  const [quote, setQuote] = useState<AccountQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [deliverToSelf, setDeliverToSelf] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [check, setCheck] = useState<ReceiveCheck | null>(null);
  const payChain = usePayChain(quote?.priceDhb, quote?.chains.map(c => c.chainId));

  const isOwn = !!walletAddress && walletAddress.toLowerCase() === listing?.seller.address.toLowerCase();
  const listingId = listing?.id;
  // Quoting needs a DeHub token, so a signed-out browser would only get a 401.
  // They see the asking price off the card and Buy opens the login modal; the
  // quote fetches on its own once they are in, because this flips with it.
  const canQuote = open && !!listingId && isAuthenticated && !isOwn;

  useEffect(() => {
    if (!canQuote) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    setReceiveAddress('');
    setCheck(null);
    getQuote
      .mutateAsync(listingId!)
      .then(q => {
        if (cancelled) return;
        setQuote(q);
        // A fresh, vacant paying wallet can take delivery itself; make that
        // the default so the usual second wallet is only asked for when it
        // is actually needed.
        setDeliverToSelf(q.selfReceivable);
      })
      .catch((err: Error) => { if (!cancelled) setQuoteError(err.message); });
    return () => { cancelled = true; };
    // getQuote is a fresh mutation object each render; keying on the listing is
    // what stops this re-firing forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, listingId]);

  // Live validation of the delivery wallet, debounced so we do not hit the
  // server on every keystroke of a pasted-then-corrected address.
  const debouncedAddress = useDebouncedValue(receiveAddress.trim(), 400);
  useEffect(() => {
    setCheck(null);
    if (!quote || deliverToSelf) return;
    if (!ADDRESS_SHAPE.test(debouncedAddress)) return;
    let cancelled = false;
    checkReceive
      .mutateAsync({ listingId: quote.listingId, receiveAddress: debouncedAddress })
      .then(result => { if (!cancelled) setCheck(result); })
      .catch((err: Error) => {
        if (!cancelled) setCheck({ receiveAddress: debouncedAddress, ok: false, problem: err.message });
      });
    return () => { cancelled = true; };
    // checkReceive is a fresh mutation object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAddress, quote?.listingId, deliverToSelf]);

  if (!listing) return null;

  const busy = stage === 'paying' || stage === 'confirming';
  const payChainMeta = SUPPORTED_CHAINS.find(c => c.id === payChain?.chainId);
  const since = accountSince(listing.seller.accountCreatedAt);

  const usingSelf = deliverToSelf && !!quote?.selfReceivable;
  const receiveOk =
    usingSelf ||
    (!!check?.ok && check.receiveAddress.toLowerCase() === debouncedAddress.toLowerCase());
  const checking =
    !usingSelf && ADDRESS_SHAPE.test(debouncedAddress) &&
    (checkReceive.isPending || (receiveAddress.trim() !== debouncedAddress && !check));

  const handleBuy = async () => {
    if (!isAuthenticated) return openLoginModal();
    if (!quote || !receiveOk) return;
    const result = await buy
      .mutateAsync({
        quote,
        receiveAddress: usingSelf ? undefined : debouncedAddress,
      })
      .catch(() => null);
    if (result) onClose();
  };

  return (
    <>
      <Drawer open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
        <DrawerContent className="bg-zinc-950 border-white/10">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-white break-all">
              <span className="text-zinc-500">@</span>{listing.username}
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* What is being bought. */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{compactCount(listing.seller.followers)} followers</span>
              <span className="flex items-center gap-1"><Upload className="w-3.5 h-3.5" />{compactCount(listing.seller.uploads)} uploads</span>
              {since && <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{since}</span>}
            </div>

            {listing.description && (
              <p className="text-sm text-zinc-300">{listing.description}</p>
            )}

            {/* Price */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs text-zinc-500 mb-1">Asking price</p>
              <p className="text-2xl font-bold text-white flex items-center gap-2">
                <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
                {(quote?.priceDhb ?? listing.priceDhb).toLocaleString()}
                <span className="text-sm font-normal text-zinc-500">DHB</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                ≈ ${(quote?.priceUsd ?? listing.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })} · paid
                straight to the seller, DeHub takes no cut
              </p>
            </div>

            {/* Where the account will land. */}
            {quote && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2.5">
                <p className="text-xs text-zinc-500">Deliver the account to</p>

                {quote.selfReceivable && (
                  <button
                    disabled={busy}
                    onClick={() => setDeliverToSelf(v => !v)}
                    className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                      deliverToSelf
                        ? 'border-white/60 bg-white/10 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-400'
                    }`}
                  >
                    <Wallet className="w-4 h-4 shrink-0" />
                    This wallet
                    {deliverToSelf && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                )}

                {!usingSelf && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Receiving wallet address</Label>
                    <div className="relative">
                      <Input
                        value={receiveAddress}
                        onChange={e => setReceiveAddress(e.target.value)}
                        spellCheck={false}
                        autoCapitalize="none"
                        placeholder="0x…"
                        disabled={busy}
                        className="pr-9 bg-black/60 border-white/10 rounded-xl text-white font-mono text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        {checking ? (
                          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                        ) : receiveOk ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : check && !check.ok ? (
                          <X className="w-4 h-4 text-red-400" />
                        ) : null}
                      </span>
                    </div>
                    {check && !check.ok && check.problem ? (
                      <p className="text-[11px] text-red-400">{check.problem}</p>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        The account arrives on a vacant wallet that has signed in to DeHub at least once.
                        Sign in once with a fresh wallet, then paste its address here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Network — reported, not chosen. */}
            {payChainMeta && (
              <p className="text-xs text-zinc-500 flex items-center gap-2">
                <img src={payChainMeta.icon} alt="" className="w-4 h-4 rounded-full" />
                {payChain?.covered
                  ? `Paying with DHB on ${payChainMeta.name}`
                  : `You are short of DHB — this will be paid on ${payChainMeta.name}`}
              </p>
            )}

            {quoteError && (
              <p className="text-sm text-red-400">{quoteError}</p>
            )}

            {isOwn && (
              <p className="text-sm text-zinc-400">
                This is your listing. Manage it from the Sell tab.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={isOwn || busy || (isAuthenticated && (!quote || !receiveOk))}
                onClick={handleBuy}
              >
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {stage === 'paying'
                  ? 'Confirm in your wallet…'
                  : stage === 'confirming'
                    ? 'Transferring the account…'
                    : !isAuthenticated
                      ? 'Sign in to buy'
                      : `Buy @${listing.username}`}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setShareOpen(true)} disabled={busy}>
                <Share2 className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-[11px] text-zinc-500 flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
              You get the whole account — handle, posts, followers, tips history and badge entitlements.
              The seller keeps their wallet and everything in it. The transfer runs only after DeHub reads
              your DHB payment back off the chain; if it is interrupted, retrying the purchase resumes it.
            </p>
          </div>
        </DrawerContent>
      </Drawer>

      <ShareEntityDrawer
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={`${window.location.origin}/accounts?handle=${encodeURIComponent(listing.username)}`}
        shareTitle={`@${listing.username} is for sale on DeHub`}
      />
    </>
  );
}
