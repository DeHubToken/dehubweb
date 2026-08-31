/**
 * Body of the "Unlock your wallet to continue" toast.
 *
 * The frequency setting lives in Settings, and the toast used to link there —
 * which meant answering "stop asking me so often" cost you the page you were
 * on and the tip/post you were part-way through. The same choice is offered
 * inline here instead.
 *
 * It applies from the NEXT unlock, never this one: by the time this toast
 * exists smart-wallet.ts has already seen the interval lapse and called
 * lockWallet(), which clears the key vault. No setting can bring that back, so
 * the copy must not imply the current prompt goes away.
 *
 * The biometrics offer beside it is the better answer to the same complaint:
 * an interval only changes how OFTEN the password is asked for, whereas
 * enrolling this device replaces the password with one Face ID / fingerprint
 * prompt. It could only be discovered from the enrolment offer that follows a
 * password unlock, and declining that once sets a flag which silences it
 * forever — so a user who said "not now" on day one was never told again.
 * Clicking here is an explicit opt-in, so it clears that flag on the way past.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useWalletUnlockInterval,
  type WalletUnlockIntervalOption,
} from '@/hooks/use-wallet-unlock-interval';
import {
  isBiometricUnlockAvailable,
  hasBiometricUsableHere,
  clearBiometricOfferDecline,
} from '@/lib/wallet-core/biometric-unlock';

const OPTIONS: { value: WalletUnlockIntervalOption; key: string; label: string }[] = [
  { value: '15m', key: 'walletUnlockToast.opt15m', label: '15 min' },
  { value: '1h', key: 'walletUnlockToast.opt1h', label: '1 hour' },
  { value: '6h', key: 'walletUnlockToast.opt6h', label: '6 hours' },
  { value: '24h', key: 'walletUnlockToast.opt24h', label: '24 hours' },
  { value: 'never', key: 'walletUnlockToast.optNever', label: 'Until I log out' },
];

const DURATIONS: Record<WalletUnlockIntervalOption, { key: string; label: string }> = {
  '15m': { key: 'walletUnlockToast.dur15m', label: '15 minutes' },
  '1h': { key: 'walletUnlockToast.dur1h', label: '1 hour' },
  '6h': { key: 'walletUnlockToast.dur6h', label: '6 hours' },
  '24h': { key: 'walletUnlockToast.dur24h', label: '24 hours' },
  never: { key: 'walletUnlockToast.durNever', label: 'until you log out' },
};

interface WalletUnlockToastBodyProps {
  expanded: boolean;
  /** Set once the user has just picked, so the toast confirms instead of re-offering. */
  chosen: WalletUnlockIntervalOption | null;
  onExpand: () => void;
  onPicked: (option: WalletUnlockIntervalOption) => void;
  /** Opens the unlock sheet, same as the toast's own Unlock button. */
  onUnlock: () => void;
}

/**
 * True when this device could do biometrics but isn't set up for them yet.
 *
 * Deliberately NOT gated on hasDeclinedBiometricOffer — that flag is what this
 * button exists to route around. It IS gated on hasBiometricUsableHere, since
 * someone already enrolled gets the biometric prompt in the unlock sheet and
 * has nothing to set up.
 */
function useBiometricSetupOffer(): boolean {
  const [offer, setOffer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const uid = localStorage.getItem('dehub_supabase_uid');
    if (!uid || hasBiometricUsableHere(uid)) return;
    // Cheap platform-authenticator probe; failure just means no offer.
    isBiometricUnlockAvailable().then((ok) => {
      if (!cancelled && ok) setOffer(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return offer;
}

export function WalletUnlockToastBody({
  expanded,
  chosen,
  onExpand,
  onPicked,
  onUnlock,
}: WalletUnlockToastBodyProps) {
  const { t } = useTranslation();
  const canOfferBiometrics = useBiometricSetupOffer();
  const { option, setOption } = useWalletUnlockInterval();

  if (expanded) {
    return (
      <div className="space-y-2">
        <p>
          {t(
            'walletUnlockToast.pickPrompt',
            'From your next unlock, stay unlocked for:',
          )}
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOption(o.value);
                onPicked(o.value);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                option === o.value
                  ? 'border-white/40 bg-white/25 text-white'
                  : 'border-white/15 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
              }`}
            >
              {t(o.key, o.label)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (chosen) {
    return (
      <p>
        {t('walletUnlockToast.saved', 'Saved — your next unlock lasts {{duration}}.', {
          duration: t(DURATIONS[chosen].key, DURATIONS[chosen].label),
        })}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p>
        {canOfferBiometrics
          ? t(
              // "or use biometrics" would be wrong here — this branch only
              // renders for a device that has none set up yet.
              'walletUnlockToast.reassureNoBiometrics',
              'Nothing failed — enter your wallet password and your action will go through.',
            )
          : t(
              'walletUnlockToast.reassure',
              'Nothing failed — enter your wallet password (or use biometrics) and your action will go through.',
            )}
      </p>
      <div className="flex gap-1.5">
        {canOfferBiometrics && (
          <button
            type="button"
            onClick={() => {
              const uid = localStorage.getItem('dehub_supabase_uid');
              // Undo an earlier "not now" so the enrolment offer actually
              // appears after the password unlock this is about to open.
              if (uid) clearBiometricOfferDecline(uid);
              onUnlock();
            }}
            className="flex-1 rounded-md bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/30"
          >
            {t('walletUnlockToast.setUpBiometrics', 'Set up biometrics')}
          </button>
        )}
        <button
          type="button"
          onClick={onExpand}
          className="flex-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          {t('walletUnlockToast.askLessOften', 'Ask less often')}
        </button>
      </div>
    </div>
  );
}
