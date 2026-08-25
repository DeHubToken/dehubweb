/**
 * Buy Username Drawer
 * ===================
 * The handle, what it costs, what you give up, and one button.
 *
 * "What you give up" is the part that is easy to leave out and must not be:
 * buying a handle **replaces** the one you are wearing, and nobody should
 * discover that after paying. The drawer says the old name out loud, next to
 * the new one, before the button is reachable.
 *
 * The price is quoted by the server when the drawer opens and re-quoted on
 * every open — a listing can sit in the grid for days and the seller can
 * reprice it. Nothing here computes an amount.
 */

import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, ShieldCheck, Share2 } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import { ShareEntityDrawer } from '@/components/app/ShareEntityDrawer';
import { useAuth } from '@/contexts/AuthContext';
import { useBuyUsername } from '@/hooks/use-username-market';
import { SUPPORTED_CHAINS, type ChainId } from '@/components/app/ChainSelector';
import type { UsernameListing, UsernameQuote } from '@/lib/api/dehub/username-market';

interface Props {
  listing: UsernameListing | null;
  open: boolean;
  onClose: () => void;
}

export function BuyUsernameDrawer({ listing, open, onClose }: Props) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const { getQuote, buy, stage } = useBuyUsername();
  const [quote, setQuote] = useState<UsernameQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [chainId, setChainId] = useState<ChainId>(8453);
  const [shareOpen, setShareOpen] = useState(false);

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
    getQuote
      .mutateAsync(listingId!)
      .then(q => { if (!cancelled) setQuote(q); })
      .catch((err: Error) => { if (!cancelled) setQuoteError(err.message); });
    return () => { cancelled = true; };
    // getQuote is a fresh mutation object each render; keying on the listing is
    // what stops this re-firing forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuote, listingId]);

  if (!listing) return null;

  const busy = stage === 'paying' || stage === 'confirming';
  const payableChains = SUPPORTED_CHAINS.filter(c =>
    (quote?.chains || []).some(q => q.chainId === c.id),
  );

  const handleBuy = async () => {
    if (!isAuthenticated) return openLoginModal();
    if (!quote) return;
    const result = await buy.mutateAsync({ quote, chainId }).catch(() => null);
    if (result && !result.pending) onClose();
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

            {/* The swap, said out loud. */}
            {quote && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs text-zinc-500 mb-2">Your handle changes</p>
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-zinc-400 line-through break-all">
                    @{quote.currentUsername || '—'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0" />
                  <span className="text-white font-semibold break-all">@{quote.username}</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-2">
                  Your old handle is released and anyone can take it. Posts, followers and your wallet are
                  untouched.
                </p>
              </div>
            )}

            {/* Network */}
            {payableChains.length > 1 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">Pay with DHB on</p>
                <div className="flex gap-2">
                  {payableChains.map(chain => (
                    <button
                      key={chain.id}
                      disabled={busy}
                      onClick={() => setChainId(chain.id as ChainId)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                        chainId === chain.id
                          ? 'border-white/60 bg-white/10 text-white'
                          : 'border-white/10 bg-white/5 text-zinc-400'
                      }`}
                    >
                      <img src={chain.icon} alt="" className="w-4 h-4" />
                      {chain.name}
                    </button>
                  ))}
                </div>
              </div>
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
                disabled={isOwn || busy || (isAuthenticated && !quote)}
                onClick={handleBuy}
              >
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {stage === 'paying'
                  ? 'Confirm in your wallet…'
                  : stage === 'confirming'
                    ? 'Confirming on-chain…'
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
              The handle moves only after DeHub reads your DHB transfer back off the chain. If it cannot,
              the payment is recorded against the sale so the seller can refund you.
            </p>
          </div>
        </DrawerContent>
      </Drawer>

      <ShareEntityDrawer
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={`${window.location.origin}/usernames?handle=${encodeURIComponent(listing.username)}`}
        shareTitle={`@${listing.username} is for sale on DeHub`}
      />
    </>
  );
}
