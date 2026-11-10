import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { TwoFactorCodeInput } from './TwoFactorCodeInput';

export interface TwoFactorLoginAccount {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface TwoFactorLoginStepProps {
  account: TwoFactorLoginAccount;
  /** Resolves on success; rejects with the server's message on a wrong code. */
  onSubmit: (input: { code?: string; backupCode?: string; trustDevice: boolean }) => Promise<void>;
  onCancel: () => void;
  /** Gallery/preview only. */
  previewMode?: 'app' | 'backup';
  previewCode?: string;
  previewError?: string | null;
}

/**
 * The extra screen a sign-in meets when the account has two-step sign-in on.
 * It sits after whichever door was used (Google, Apple, email, phone, wallet,
 * passkey): the server holds the session back until a code is accepted.
 */
export function TwoFactorLoginStep({ account, onSubmit, onCancel, previewMode, previewCode, previewError }: TwoFactorLoginStepProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'app' | 'backup'>(previewMode ?? 'app');
  const [code, setCode] = useState(previewCode ?? '');
  const [backupCode, setBackupCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState<string | null>(previewError ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (value?: string) => {
    if (busy) return;
    const appCode = value ?? code;
    if (mode === 'app' && appCode.length !== 6) return;
    if (mode === 'backup' && backupCode.replace(/[^a-z0-9]/gi, '').length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode === 'app' ? { code: appCode, trustDevice } : { backupCode: backupCode.trim(), trustDevice });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('twoFactor.wrongCode', 'That code didn’t match. Try the newest one in your app.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const name = account.username ? `@${account.username}` : account.displayName;

  return (
    <div className="flex flex-col items-center gap-5" data-two-factor-login>
      <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-4">
        {account.avatarUrl ? (
          <img src={account.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-white/15 text-sm font-semibold text-white">
            {(name ?? '?').replace('@', '').slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="text-sm font-medium text-white">{name}</span>
      </div>

      <p className="max-w-[34ch] text-center text-sm text-white/60">
        {mode === 'app'
          ? t('twoFactor.loginBody', 'This account has two-step sign-in. Open your authenticator app and enter the code for Riftn.')
          : t('twoFactor.loginBackupBody', 'Enter one of the backup codes you saved when you turned this on. Each code works once.')}
      </p>

      {mode === 'app' ? (
        <TwoFactorCodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={(v) => submit(v)} disabled={busy} invalid={!!error} />
      ) : (
        <Input
          value={backupCode}
          onChange={(e) => { setBackupCode(e.target.value.toUpperCase()); setError(null); }}
          placeholder="XXXX-XXXX"
          autoFocus
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          className={cn(
            'h-14 rounded-xl border-white/10 bg-white/10 text-center font-mono text-xl tracking-[0.3em] text-white placeholder:text-white/30',
            error && 'border-red-400/70',
          )}
        />
      )}

      {error && <p role="alert" className="-mt-2 text-center text-sm text-red-400">{error}</p>}

      <label className="flex w-full cursor-pointer items-center gap-3 px-1 text-sm text-white/70">
        <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} className="size-5 shrink-0 cursor-pointer rounded-md accent-white" />
        {t('twoFactor.trustDevice', 'Don’t ask again on this device for 30 days')}
      </label>

      <button
        type="button"
        onClick={() => submit()}
        disabled={busy || (mode === 'app' ? code.length !== 6 : backupCode.replace(/[^a-z0-9]/gi, '').length < 8)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-semibold text-black transition-opacity hover:bg-white/90 disabled:opacity-40"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t('twoFactor.signIn', 'Sign in')}
      </button>

      <div className="flex w-full flex-col items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => { setMode(mode === 'app' ? 'backup' : 'app'); setError(null); }}
          className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {mode === 'app' ? t('twoFactor.useBackup', 'Use a backup code instead') : t('twoFactor.useApp', 'Use my authenticator app')}
        </button>
        <a href="/support" className="text-xs text-white/40 transition-colors hover:text-white/70">
          {t('twoFactor.lostEverything', 'Lost your phone and your backup codes? Contact support')}
        </a>
        <button type="button" onClick={onCancel} className="text-xs text-white/40 transition-colors hover:text-white/70">
          {t('twoFactor.useAnother', 'Sign in with a different account')}
        </button>
      </div>
    </div>
  );
}
