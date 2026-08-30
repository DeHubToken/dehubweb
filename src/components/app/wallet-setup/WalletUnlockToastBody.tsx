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
 */
import { useTranslation } from 'react-i18next';
import {
  useWalletUnlockInterval,
  type WalletUnlockIntervalOption,
} from '@/hooks/use-wallet-unlock-interval';

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
}

export function WalletUnlockToastBody({
  expanded,
  chosen,
  onExpand,
  onPicked,
}: WalletUnlockToastBodyProps) {
  const { t } = useTranslation();
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
        {t(
          'walletUnlockToast.reassure',
          'Nothing failed — enter your wallet password (or use biometrics) and your action will go through.',
        )}
      </p>
      <button
        type="button"
        onClick={onExpand}
        className="w-full rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white"
      >
        {t('walletUnlockToast.askLessOften', 'Ask less often')}
      </button>
    </div>
  );
}
