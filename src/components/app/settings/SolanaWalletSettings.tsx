import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SettingsRow, SETTINGS_CONTROL_CLASS } from '@/components/app/settings/SettingsRow';
import { useAuth } from '@/contexts/AuthContext';
import { linkSolanaWallet, unlinkSolanaWallet } from '@/lib/api/dehub/solana';
import { buildDeHubLoginMessage } from '@/lib/dehub-login-message';
import solanaLogo from '@/assets/icons/solana-logo.png';

/**
 * "Solana wallet" — connect Phantom so you can be paid on Solana.
 *
 * **Why an account needs this at all.** A Solana tip or PPV unlock is a
 * transfer straight to a Solana address, and a DeHub account is keyed by an
 * EVM address. Until this existed the API resolved a creator's Solana
 * recipient from `token.minter` alone, which is an `0x` address on every EVM
 * post — so a Solana payment to anyone who had not personally minted that post
 * with Phantom failed with "Creator Solana address unavailable".
 *
 * **Why there is no second-wallet problem here**, unlike the ENS panel.
 * Phantom's Solana account lives behind `window.phantom.solana`, an entirely
 * separate provider from `window.ethereum`. Connecting it never touches wagmi,
 * so AuthProvider's CASE B watcher — which clears the session the moment it
 * sees a foreign wagmi address — never fires. A plain Connect button is safe
 * here in a way it would not be for an EVM wallet.
 *
 * The signature is the ordinary DeHub login message for this account's own EVM
 * address. That binds the proof to this account (a captured signature cannot
 * be replayed onto another) and to this moment (the server refuses one older
 * than the login window).
 *
 * It sits in Assets rather than beside ENS because it answers "where does my
 * money arrive", not "what am I called".
 */
export function SolanaWalletSettings() {
  const { t } = useTranslation();
  const { user, walletAddress, refreshUser } = useAuth();

  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const linked = user?.solanaAddress ?? null;

  const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

  const handleCopy = async () => {
    if (!linked) return;
    try {
      await navigator.clipboard.writeText(linked);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('settings.solanaCopyFailed', 'Could not copy the address'));
    }
  };

  const handleConnect = async () => {
    if (!walletAddress) {
      toast.error(t('settings.solanaNeedsSignIn', 'Sign in first'));
      return;
    }

    setBusy(true);
    try {
      // Loaded on demand — Settings should not carry the base58 encoder and
      // the Phantom shims on first paint for a row most people never touch.
      const { getSolanaProvider, signSolanaLoginProof } = await import('@/lib/solana/wallet');

      if (!getSolanaProvider()) {
        toast.error(t('settings.solanaNoPhantom', 'Phantom not found'), {
          description: t(
            'settings.solanaNoPhantomHint',
            'Install the Phantom extension, or open dehub.io in the Phantom browser.',
          ),
        });
        return;
      }

      // Seconds, and the same value the message is built from — the server
      // rebuilds the string from this exact number and compares signatures.
      const timestamp = Math.floor(Date.now() / 1000);
      const proof = await signSolanaLoginProof(buildDeHubLoginMessage(walletAddress, timestamp));
      if (!proof) {
        // Covers a declined prompt and a Phantom too old to sign a message.
        // Neither deserves an error — the user knows what they just did.
        toast.info(t('settings.solanaNotSigned', 'Nothing was connected'));
        return;
      }

      await linkSolanaWallet({
        solanaAddress: proof.address,
        signature: proof.signature,
        timestamp,
      });
      await refreshUser();
      toast.success(t('settings.solanaLinked', 'Solana wallet connected'), {
        description: shorten(proof.address),
      });
    } catch (error: any) {
      toast.error(
        error?.message || t('settings.solanaLinkFailed', 'Could not connect that wallet'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await unlinkSolanaWallet();
      await refreshUser();
      toast.success(t('settings.solanaUnlinked', 'Solana wallet disconnected'));
    } catch (error: any) {
      toast.error(
        error?.message || t('settings.solanaUnlinkFailed', 'Could not disconnect that wallet'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      anchor="solana-wallet"
      icon={<img src={solanaLogo} alt="" className="object-contain" />}
      title={t('settings.solanaWallet', 'Solana wallet')}
      description={linked ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-mono">{shorten(linked)}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 hover:text-white"
            aria-label={t('settings.solanaCopy', 'Copy Solana address')}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </span>
      ) : (
        t('settings.solanaWalletHint', 'Connect Phantom to receive tips and paid unlocks on Solana.')
      )}
      action={
        <Button
          type="button"
          size="sm"
          variant={linked ? 'outline' : 'default'}
          loading={busy}
          onClick={linked ? handleDisconnect : handleConnect}
          className={linked ? SETTINGS_CONTROL_CLASS : undefined}
        >
          {linked ? t('settings.solanaDisconnect', 'Disconnect') : t('settings.solanaConnect', 'Connect')}
        </Button>
      }
    />
  );
}

export default SolanaWalletSettings;
