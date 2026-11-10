import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import qrcode from 'qrcode-generator';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import CopyIcon from '@/components/ui/cut-icons/copy';
import DownloadIcon from '@/components/ui/cut-icons/download';
import CheckIcon from '@/components/ui/cut-icons/check';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

import { TwoFactorCodeInput } from './TwoFactorCodeInput';

export type TwoFactorStep = 'intro' | 'link' | 'confirm' | 'codes' | 'manage' | 'turn-off' | 'new-codes';

export interface TwoFactorEnrollment {
  /** Base32 secret, shown grouped in fours for typing by hand. */
  secret: string;
  /** otpauth:// link: the QR payload and the phone's "open in app" target. */
  otpauthUrl: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt?: string | null;
  backupCodesLeft?: number;
}

export interface TwoFactorApi {
  start: () => Promise<TwoFactorEnrollment>;
  confirm: (code: string) => Promise<{ backupCodes: string[] }>;
  disable: (code: string) => Promise<void>;
  regenerateCodes: (code: string) => Promise<{ backupCodes: string[] }>;
}

interface TwoFactorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: TwoFactorStatus;
  api: TwoFactorApi;
  onChanged?: () => void;
  /** Gallery/preview only: open on a given step with given content. */
  previewStep?: TwoFactorStep;
  previewEnrollment?: TwoFactorEnrollment;
  previewCodes?: string[];
  previewCode?: string;
  previewError?: string | null;
}

const SETUP_STEPS: TwoFactorStep[] = ['intro', 'link', 'confirm', 'codes'];

/**
 * Turning on, managing and turning off two-step sign-in.
 *
 * One sheet, the same bottom sheet every other settings flow uses (it docks
 * to the middle column on desktop). Setup is four short screens with a step
 * bar: what it is, link the app, prove it works, keep the backup codes.
 * Nothing is switched on until a real code from the app has been accepted,
 * so a half-finished setup can never lock anyone out.
 */
export function TwoFactorSheet({
  open,
  onOpenChange,
  status,
  api,
  onChanged,
  previewStep,
  previewEnrollment,
  previewCodes,
  previewCode,
  previewError,
}: TwoFactorSheetProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [step, setStep] = useState<TwoFactorStep>(previewStep ?? (status.enabled ? 'manage' : 'intro'));
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(previewEnrollment ?? null);
  const [code, setCode] = useState(previewCode ?? '');
  const [error, setError] = useState<string | null>(previewError ?? null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>(previewCodes ?? []);
  const [saved, setSaved] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!open || previewStep) return;
    setStep(status.enabled ? 'manage' : 'intro');
    setCode('');
    setError(null);
    setSaved(false);
    setShowQr(false);
    // Only on open: the status flips to enabled mid-setup (right before the
    // backup codes show), and that must not yank the sheet to Manage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewStep]);

  const go = (next: TwoFactorStep) => {
    setCode('');
    setError(null);
    setStep(next);
  };

  const begin = async () => {
    setBusy(true);
    try {
      setEnrollment(await api.start());
      go('link');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (step === 'confirm') {
        const result = await api.confirm(value);
        setCodes(result.backupCodes);
        go('codes');
        onChanged?.();
      } else if (step === 'turn-off') {
        await api.disable(value);
        toast.success(t('twoFactor.turnedOff', 'Two-step sign-in is off'));
        onChanged?.();
        onOpenChange(false);
      } else if (step === 'new-codes') {
        const result = await api.regenerateCodes(value);
        setCodes(result.backupCodes);
        setSaved(false);
        go('codes');
        onChanged?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('twoFactor.wrongCode', 'That code didn’t match. Try the newest one in your app.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const setupIndex = SETUP_STEPS.indexOf(step);
  const title =
    step === 'intro' ? t('twoFactor.introTitle', 'Add a second lock')
    : step === 'link' ? t('twoFactor.linkTitle', 'Link your authenticator app')
    : step === 'confirm' ? t('twoFactor.confirmTitle', 'Enter the 6-digit code')
    : step === 'codes' ? t('twoFactor.codesTitle', 'Save your backup codes')
    : step === 'turn-off' ? t('twoFactor.turnOffTitle', 'Turn off two-step sign-in')
    : step === 'new-codes' ? t('twoFactor.newCodesTitle', 'Get new backup codes')
    : t('twoFactor.manageTitle', 'Two-step sign-in');

  return (
    <Drawer open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DrawerContent column glass data-two-factor-sheet className="max-h-[92vh] max-h-[92dvh]">
        <DrawerHeader className="pb-2">
          {setupIndex >= 0 && (
            <div className="mx-auto mb-4 flex w-full max-w-[220px] gap-1.5" aria-hidden>
              {SETUP_STEPS.map((s, i) => (
                <span key={s} className={cn('h-1 flex-1 rounded-full transition-colors', i <= setupIndex ? 'bg-white' : 'bg-white/15')} />
              ))}
            </div>
          )}
          <DrawerTitle className="text-center text-lg font-semibold text-white">{title}</DrawerTitle>
        </DrawerHeader>

        <div className="mx-auto w-full max-w-[420px] overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {step === 'intro' && (
            <div className="flex flex-col items-center gap-5">
              <div className="grid size-20 place-items-center rounded-[22px] border border-white/10 bg-white/[0.06]">
                <ThemedIcon icon="lock" className="size-12 object-contain" />
              </div>
              <p className="max-w-[34ch] text-center text-sm text-white/60">
                {t('twoFactor.introBody', 'After you sign in, Riftn asks for a code from an app on your phone. Someone with your password, email or wallet still can’t get in.')}
              </p>
              <ul className="w-full space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                <Bullet>{t('twoFactor.introPoint1', 'A new code every 30 seconds, only on your phone')}</Bullet>
                <Bullet>{t('twoFactor.introPoint2', 'Works however you sign in: Google, Apple, email, phone or wallet')}</Bullet>
                <Bullet>{t('twoFactor.introPoint3', 'Asked once per device, not every time you open Riftn')}</Bullet>
              </ul>
              <p className="text-center text-xs text-white/40">
                {t('twoFactor.introApps', 'Use any authenticator app: Google Authenticator, Microsoft Authenticator, Authy, 1Password or your phone’s Passwords app.')}
              </p>
              <PrimaryButton onClick={begin} busy={busy}>{t('twoFactor.getStarted', 'Set it up')}</PrimaryButton>
              <QuietButton onClick={() => onOpenChange(false)}>{t('common.notNow', 'Not now')}</QuietButton>
            </div>
          )}

          {step === 'link' && enrollment && (
            <div className="flex flex-col items-center gap-5">
              {isMobile ? (
                <>
                  <p className="max-w-[34ch] text-center text-sm text-white/60">
                    {t('twoFactor.linkBodyPhone', 'Tap below to add Riftn to your authenticator app, then come back here.')}
                  </p>
                  <PrimaryButton onClick={() => { window.location.href = enrollment.otpauthUrl; }}>
                    {t('twoFactor.openApp', 'Add to authenticator app')}
                  </PrimaryButton>
                  <SecretKey secret={enrollment.secret} />
                  {showQr ? (
                    <QrTile value={enrollment.otpauthUrl} />
                  ) : (
                    <QuietButton onClick={() => setShowQr(true)}>{t('twoFactor.showQr', 'App on another device? Show QR code')}</QuietButton>
                  )}
                </>
              ) : (
                <>
                  <p className="max-w-[38ch] text-center text-sm text-white/60">
                    {t('twoFactor.linkBodyDesktop', 'Open your authenticator app, tap + and scan this code with your phone camera.')}
                  </p>
                  <QrTile value={enrollment.otpauthUrl} />
                  <SecretKey secret={enrollment.secret} />
                </>
              )}
              <PrimaryButton onClick={() => go('confirm')}>{t('twoFactor.linkedNext', 'I’ve added it')}</PrimaryButton>
            </div>
          )}

          {(step === 'confirm' || step === 'turn-off' || step === 'new-codes') && (
            <div className="flex flex-col items-center gap-5">
              <p className="max-w-[34ch] text-center text-sm text-white/60">
                {step === 'confirm'
                  ? t('twoFactor.confirmBody', 'Type the code your app shows for Riftn. This proves it’s linked before we switch anything on.')
                  : step === 'turn-off'
                    ? t('twoFactor.turnOffBody', 'Enter a code from your authenticator app to turn this off. Your account goes back to one lock.')
                    : t('twoFactor.newCodesBody', 'Enter a code from your authenticator app. Your old backup codes stop working right away.')}
              </p>
              <TwoFactorCodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={submit} disabled={busy} invalid={!!error} />
              <p className={cn('min-h-5 text-center text-sm', error ? 'text-red-400' : 'text-white/40')} role={error ? 'alert' : undefined}>
                {error ?? t('twoFactor.codeHint', 'Codes change every 30 seconds')}
              </p>
              {step === 'turn-off' ? (
                <button
                  type="button"
                  onClick={() => submit()}
                  disabled={code.length !== 6 || busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-500 font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t('twoFactor.turnOff', 'Turn off')}
                </button>
              ) : (
                <PrimaryButton onClick={() => submit()} busy={busy} disabled={code.length !== 6}>
                  {step === 'confirm' ? t('twoFactor.verify', 'Verify and turn on') : t('twoFactor.makeNewCodes', 'Make new codes')}
                </PrimaryButton>
              )}
              <QuietButton onClick={() => go(step === 'confirm' ? 'link' : 'manage')}>{t('common.back', 'Back')}</QuietButton>
            </div>
          )}

          {step === 'codes' && (
            <div className="flex flex-col items-center gap-5">
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-500">
                <CheckIcon className="size-4" />
                {t('twoFactor.nowOn', 'Two-step sign-in is on')}
              </div>
              <p className="max-w-[36ch] text-center text-sm text-white/60">
                {t('twoFactor.codesBody', 'Lose your phone? Each of these codes gets you in once. Keep them somewhere safe, like a password manager.')}
              </p>
              <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-mono text-[15px] tracking-wider text-white">
                {codes.map((c) => <span key={c} className="text-center tabular-nums">{c}</span>)}
              </div>
              <div className="grid w-full grid-cols-2 gap-2">
                <SoftButton
                  onClick={() => {
                    void navigator.clipboard?.writeText(codes.join('\n'));
                    toast.success(t('twoFactor.codesCopied', 'Backup codes copied'));
                  }}
                >
                  <CopyIcon className="size-4" /> {t('common.copy', 'Copy')}
                </SoftButton>
                <SoftButton onClick={() => downloadCodes(codes)}>
                  <DownloadIcon className="size-4" /> {t('common.download', 'Download')}
                </SoftButton>
              </div>
              <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-1 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="size-5 shrink-0 cursor-pointer rounded-md accent-white"
                />
                {t('twoFactor.codesSaved', 'I’ve saved these codes')}
              </label>
              <PrimaryButton onClick={() => onOpenChange(false)} disabled={!saved}>{t('common.done', 'Done')}</PrimaryButton>
            </div>
          )}

          {step === 'manage' && (
            <div className="flex flex-col gap-2">
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
                  <ThemedIcon icon="lock" className="size-7 object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-white">
                    {t('twoFactor.statusOn', 'On')}
                    <span className="size-2 rounded-full bg-emerald-400" aria-hidden />
                  </div>
                  <div className="text-sm text-white/50">
                    {status.enabledAt
                      ? t('twoFactor.since', 'Authenticator app since {{date}}', { date: formatDate(status.enabledAt) })
                      : t('twoFactor.authenticatorApp', 'Authenticator app')}
                  </div>
                </div>
              </div>
              <ManageRow
                title={t('twoFactor.backupCodes', 'Backup codes')}
                detail={t('twoFactor.codesLeft', '{{count}} of 10 left', { count: status.backupCodesLeft ?? 0 })}
                action={t('twoFactor.getNew', 'Get new')}
                onClick={() => go('new-codes')}
              />
              <p className="px-1 pt-2 text-xs text-white/40">
                {t('twoFactor.newPhoneTip', 'Changing phones? Most authenticator apps move your codes for you. If yours doesn’t, turn this off on the old phone and set it up again on the new one.')}
              </p>
              <button
                type="button"
                onClick={() => go('turn-off')}
                className="mt-3 h-12 w-full rounded-xl border border-red-400/30 bg-red-500/10 font-semibold text-red-500 transition-colors hover:bg-red-500/20"
              >
                {t('twoFactor.turnOff', 'Turn off')}
              </button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-white/80">
      <CheckIcon className="mt-0.5 size-4 shrink-0 text-white" />
      <span>{children}</span>
    </li>
  );
}

function PrimaryButton({ children, onClick, busy, disabled }: { children: ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-semibold text-black transition-opacity hover:bg-white/90 disabled:opacity-40"
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

function SoftButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 text-sm font-medium text-white transition-colors hover:bg-white/15"
    >
      {children}
    </button>
  );
}

function QuietButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-white/50 transition-colors hover:text-white/80">
      {children}
    </button>
  );
}

function ManageRow({ title, detail, action, onClick }: { title: string; detail: string; action: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left transition-colors hover:bg-white/5"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white">{title}</span>
        <span className="block text-sm text-white/50">{detail}</span>
      </span>
      <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-white">{action}</span>
    </button>
  );
}

function SecretKey({ secret }: { secret: string }) {
  const { t } = useTranslation();
  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-1 text-xs text-white/40">{t('twoFactor.setupKey', 'Or type this setup key')}</div>
      <div className="flex items-center gap-3">
        <code className="min-w-0 flex-1 break-words font-mono text-[15px] tracking-wider text-white">{grouped}</code>
        <button
          type="button"
          aria-label={t('common.copy', 'Copy')}
          onClick={() => {
            void navigator.clipboard?.writeText(secret);
            toast.success(t('twoFactor.keyCopied', 'Setup key copied'));
          }}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/15"
        >
          <CopyIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function QrTile({ value }: { value: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [value]);
  return <div className="size-[184px] shrink-0 rounded-2xl bg-white p-3 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function downloadCodes(codes: string[]) {
  const body = ['Riftn backup codes', 'Each code works once.', '', ...codes, ''].join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'riftn-backup-codes.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
