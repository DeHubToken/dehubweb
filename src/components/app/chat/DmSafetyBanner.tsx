/**
 * DmSafetyBanner
 * ==============
 * Wallet-drainer scams arrive by DM: an account wearing Mal's name says your
 * profile is missing or there is a "node issue", and sends a link to fix it.
 * Two warnings, shown above the thread:
 *  - red, when the other person's name reads as a team name they don't own;
 *  - amber, when they have sent a link.
 */
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { staffImpersonated } from '@/lib/impersonation';

const LINK = /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|io|net|org|xyz|app|site|online|link|live|top|info|cc|me|co|dev|pro|gg|vip|club|fun)\b/i;

export function hasLink(text?: string | null): boolean {
  return !!text && LINK.test(text);
}

interface DmSafetyBannerProps {
  peer: { address?: string | null; displayName?: string | null; username?: string | null } | null | undefined;
  peerSentLink: boolean;
}

export function DmSafetyBanner({ peer, peerSentLink }: DmSafetyBannerProps) {
  const { t } = useTranslation();
  const impersonated = staffImpersonated(peer);
  if (!impersonated && !peerSentLink) return null;

  const danger = !!impersonated;
  return (
    <div
      role="alert"
      data-testid="dm-safety-banner"
      className={`mx-3 mt-2 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-snug ${
        danger
          ? 'border-red-500/40 bg-red-500/15 text-red-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      }`}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p>
        {danger ? (
          <>
            <span className="font-semibold">
              {t('dmSafety.notReal', { defaultValue: 'This is not the real {{name}}.', name: impersonated })}
            </span>{' '}
            {t('dmSafety.neverLink', {
              defaultValue: 'The Riftn team will never DM you a link to fix your profile or wallet. Do not open links, connect your wallet or sign anything. Block and report this account.',
            })}
          </>
        ) : (
          t('dmSafety.linkCaution', {
            defaultValue: 'Careful with links. Riftn will never ask you to connect your wallet, sign, or share your seed phrase to fix your account.',
          })
        )}
      </p>
    </div>
  );
}
