/**
 * Connect-your-wallet sheet for a signed-in session with no wallet attached.
 *
 * The state it exists for: an account whose signatures come from an external
 * wallet (MetaMask, Phantom, Trust) signed in through the email link — the
 * session is fully established, feed and profile work, and the first tip,
 * stake or send finds nothing to sign with. aa-utils raises
 * dehub:wallet-connect-required at that moment (the counterpart of the
 * built-in wallet's unlock event), and this modal answers it: explain the
 * state, offer the same wallet buttons as the login sheet, and only keep a
 * connection whose address matches the account's.
 *
 * Mounted app-wide in AppContent, next to the other session modals. The shell
 * is deliberately cheap — the wallet buttons (and the RainbowKit chunk behind
 * them) load only when the sheet actually opens.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { LogOut, Loader2 } from 'lucide-react';
import { WALLET_CONNECT_REQUIRED_EVENT } from '@/lib/wallet-reconnect';

const ConnectLinkedWalletBody = React.lazy(() =>
  import('./ConnectLinkedWalletBody').then((m) => ({ default: m.ConnectLinkedWalletBody })),
);

export function ConnectLinkedWalletModal() {
  const { isAuthenticated, walletAddress, disconnect } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(WALLET_CONNECT_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(WALLET_CONNECT_REQUIRED_EVENT, handler);
  }, []);

  // The session this sheet reconnects can end underneath it (sign-out from
  // another tab, a revoked token) — at which point connecting a wallet would
  // be a login, which is the login sheet's job.
  useEffect(() => {
    if (!isAuthenticated) setOpen(false);
  }, [isAuthenticated]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await disconnect();
      setOpen(false);
    } catch (err) {
      console.error('Logout failed:', err);
      toast.error('Could not log out — please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  if (!isAuthenticated || !walletAddress) return null;

  // The email-link login is the ordinary way into this state and deserves the
  // fuller explanation; a wallet session that simply lost its connection
  // (extension removed, site access revoked) gets the shorter one.
  const viaEmail = (() => {
    try {
      return !!localStorage.getItem('dehub_supabase_uid');
    } catch {
      return false;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md border border-white/10 bg-black/60 backdrop-blur-[24px] saturate-[180%] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Connect your wallet</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {viaEmail
              ? 'You’re signed in to a wallet-based account via email. To use wallet features, connect the account’s wallet below — we’ll check it’s the right one. Or log out and sign back in with your wallet.'
              : 'This account signs with your own wallet, and no wallet is connected right now. Reconnect it below to continue.'}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <React.Suspense
            fallback={<DeHubPageLoader size={56} minHeight="180px" className="[&_span]:text-white/50" />}
          >
            <ConnectLinkedWalletBody expectedAddress={walletAddress} onConnected={() => setOpen(false)} />
          </React.Suspense>
        )}

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors border-t border-white/10 pt-3 disabled:opacity-50"
        >
          {loggingOut ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Logging out…
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              <LogOut className="w-3.5 h-3.5" /> Log out and use my wallet to sign in
            </span>
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}
