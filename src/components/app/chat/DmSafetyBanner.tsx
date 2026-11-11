/**
 * DmSafetyBanner
 * ==============
 * Wallet-drainer scams arrive by DM: an account wearing Mal's name says your
 * profile is missing or there is a "node issue", and sends a link to fix it.
 * Shown above the thread only when the other person's name reads as a team
 * name they don't own.
 */
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { staffImpersonated } from '@/lib/impersonation';

interface DmSafetyBannerProps {
  peer: { address?: string | null; displayName?: string | null; username?: string | null } | null | undefined;
}

export function DmSafetyBanner({ peer }: DmSafetyBannerProps) {
  const { t } = useTranslation();
  const impersonated = staffImpersonated(peer);
  if (!impersonated) return null;

  return (
    <div
      role="alert"
      data-testid="dm-safety-banner"
      className="mx-3 mt-2 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2.5 text-xs leading-snug text-red-200"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p>
        <span className="font-semibold">
          {t('dmSafety.notReal', { defaultValue: 'This is not the real {{name}}.', name: impersonated })}
        </span>{' '}
        {t('dmSafety.neverLink', {
          defaultValue: 'The Riftn team will never DM you a link to fix your profile or wallet. Do not open links, connect your wallet or sign anything. Block and report this account.',
        })}
      </p>
    </div>
  );
}
