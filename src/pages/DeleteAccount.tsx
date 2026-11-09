import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Trash2 from '@/components/ui/cut-icons/delete';
import Pause from '@/components/ui/cut-icons/pause';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { deactivateAccount, eraseAccount } from '@/lib/api/dehub/account-erasure';

/**
 * Deactivate or delete, both self-serve, same as the app (Settings).
 *
 * Deactivate is the gentle one: profile, posts and comments hidden, every
 * device signed out, nothing erased; signing in again restores it all.
 *
 * Delete: read the warning, tick the box, confirm once more, done. The
 * server queues the erasure, hides the profile at once and finishes within
 * 30 days. No email step. This URL is also the data-deletion link given to
 * Google Play and App Store review, so it must answer signed out too.
 *
 * Colours: the page used shadcn `bg-background` + Button variants, which are
 * white glass made for dark backgrounds. On themes where `--background` is
 * white the Sign in and Delete buttons came out white on white. Everything
 * here uses the same theme hooks as Settings (`data-page-bento`, text-white,
 * zinc) and the two action buttons carry fixed colours so they read on every
 * theme.
 */
type Step = 'review' | 'confirm';

const RED_BUTTON =
  'inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto';
const RED_STYLE = { background: '#dc2626', color: '#ffffff' } as const;
const NEUTRAL_BUTTON =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-5 text-sm font-medium text-white disabled:opacity-40 sm:w-auto';
/** White key on dark themes; data-contrast-solid turns it ink-black on light ones (light-contrast.css). */
const SOLID_BUTTON = 'inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold disabled:opacity-40 sm:w-auto';
const SOLID_STYLE = { background: '#ffffff', color: '#0b0b0d' } as const;

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, user, walletAddress, connect, disconnect } = useAuth();
  const [step, setStep] = useState<Step>('review');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(false);
  const [pauseStep, setPauseStep] = useState<'idle' | 'confirm'>('idle');
  const [pauseBusy, setPauseBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseError, setPauseError] = useState(false);
  const [pauseAck, setPauseAck] = useState(false);

  const handle = (user as { username?: string | null } | null)?.username;
  const who = handle ? `@${handle}` : walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : '';

  const submit = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(false);
    try {
      await eraseAccount();
      setAccepted(true);
      await disconnect({ forgetProfile: true });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (pauseBusy || !pauseAck) return;
    setPauseBusy(true);
    setPauseError(false);
    try {
      await deactivateAccount();
      setPaused(true);
      // Keep the remembered profile: signing back in is how it comes back.
      await disconnect();
    } catch {
      setPauseError(true);
    } finally {
      setPauseBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 overflow-y-auto text-white" data-delete-account-page>
      {/* A utility page: the worker already answers it noindex for every UA;
          without its own head the tab kept the previous route's title. */}
      <SEOHead title={`${t('accountDeletion.title')} | Riftn`} description={t('accountDeletion.warning')} noindex />
      <div className="mx-auto max-w-xl space-y-4 px-4 py-8 sm:py-14">
        <Link to="/app/settings" className="inline-block text-sm text-zinc-400 underline underline-offset-4 hover:text-white">
          {t('accountDeletion.back')}
        </Link>

        {!accepted && (
          <section data-page-bento id="deactivate" className="space-y-4 rounded-2xl bg-zinc-900 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-white">
                <Pause className="size-5" />
              </span>
              <h2 className="text-lg font-semibold text-white">
                {t(paused ? 'accountDeactivation.done' : 'accountDeactivation.title', paused ? 'Account deactivated' : 'Deactivate account')}
              </h2>
            </div>
            {paused ? (
              <>
                <p role="status" className="text-sm leading-6 text-zinc-400">
                  {t('accountDeactivation.receipt', 'Your profile, posts and comments are hidden. Sign in again any time to bring everything back.')}
                </p>
                <Link to="/app" data-contrast-solid className={SOLID_BUTTON} style={SOLID_STYLE}>{t('accountDeletion.done')}</Link>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-zinc-400">
                  {t('accountDeactivation.description', 'Take a break instead. Your profile, posts and comments are hidden and you are signed out everywhere. Nothing is deleted, and signing back in brings it all back.')}
                </p>
                {isAuthenticated && !isLoading && (pauseStep === 'idle' ? (
                  <button type="button" className={NEUTRAL_BUTTON} onClick={() => setPauseStep('confirm')}>
                    {t('accountDeactivation.button', 'Deactivate')}
                  </button>
                ) : (
                  <div role="alertdialog" aria-labelledby="deactivate-confirm-title" className="space-y-4 rounded-xl border border-zinc-700 p-4">
                    <p id="deactivate-confirm-title" className="text-base font-semibold text-white">
                      {t('accountDeactivation.confirmTitle', 'Deactivate your account?')}
                    </p>
                    <p className="text-sm leading-6 text-zinc-400">
                      {t('accountDeactivation.confirmBody', 'Your profile, posts and comments will be hidden and you will be signed out on every device. Sign back in any time to undo this.')}
                    </p>
                    <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-white">
                      <input type="checkbox" className="mt-1 size-4 shrink-0" checked={pauseAck} disabled={pauseBusy} onChange={e => setPauseAck(e.target.checked)} />
                      <span>{t('accountDeactivation.acknowledge', 'I understand my profile will be hidden and I will be signed out everywhere.')}</span>
                    </label>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <button type="button" disabled={pauseBusy} className={NEUTRAL_BUTTON} onClick={() => { setPauseStep('idle'); setPauseError(false); setPauseAck(false); }}>
                        {t('accountDeletion.cancel')}
                      </button>
                      <button type="button" data-contrast-solid disabled={pauseBusy || !pauseAck} aria-busy={pauseBusy || undefined} className={SOLID_BUTTON} style={SOLID_STYLE} onClick={() => void deactivate()}>
                        {t(pauseBusy ? 'accountDeactivation.busy' : 'accountDeactivation.button', pauseBusy ? 'Deactivating…' : 'Deactivate')}
                      </button>
                    </div>
                  </div>
                ))}
                {pauseError && <p role="alert" className="text-sm" style={{ color: '#ef4444' }}>{t('accountDeactivation.error', 'Could not deactivate your account. Please try again.')}</p>}
              </>
            )}
          </section>
        )}

        {!paused && (
        <section data-page-bento id="delete" className="space-y-5 rounded-2xl bg-zinc-900 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(220,38,38,0.14)', color: '#ef4444' }}>
              <Trash2 className="size-5" />
            </span>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">
              {t(accepted ? 'accountDeletion.accepted' : 'accountDeletion.title')}
            </h1>
          </div>

          {accepted ? (
            <>
              <p role="status" className="text-sm leading-6 text-zinc-400">{t('accountDeletion.receipt')}</p>
              <Link to="/app" data-contrast-solid className={SOLID_BUTTON} style={SOLID_STYLE}>
                {t('accountDeletion.done')}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-zinc-400">{t('accountDeletion.warning')}</p>

              {/* While the session restores, show no key at all: a signed-in
                  visitor briefly saw "Sign in", tapped it and got the email
                  sign-in sheet, which read as "deletion needs an email". */}
              {isLoading ? null : !isAuthenticated ? (
                <button type="button" data-contrast-solid onClick={() => void connect()} className={SOLID_BUTTON} style={SOLID_STYLE}>
                  {t('accountDeletion.signIn')}
                </button>
              ) : step === 'review' ? (
                <div className="space-y-4">
                  {who && (
                    <p className="text-sm text-zinc-400">
                      {t('accountDeletion.signedInAs', 'Signed in as')} <span className="font-medium text-white">{who}</span>
                    </p>
                  )}
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-white">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-red-600"
                      checked={confirmed}
                      disabled={busy}
                      onChange={e => setConfirmed(e.target.checked)}
                    />
                    <span>{t('accountDeletion.acknowledge')}</span>
                  </label>
                  <button
                    type="button"
                    disabled={!confirmed}
                    onClick={() => setStep('confirm')}
                    className={RED_BUTTON}
                    style={RED_STYLE}
                  >
                    {t('accountDeletion.title')}
                  </button>
                </div>
              ) : (
                <div role="alertdialog" aria-labelledby="delete-confirm-title" className="space-y-4 rounded-xl p-4" style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(220,38,38,0.08)' }}>
                  <p id="delete-confirm-title" className="text-base font-semibold text-white">
                    {t('accountDeletion.confirmTitle', 'Delete your account for good?')}
                  </p>
                  <p className="text-sm leading-6 text-zinc-400">
                    {who
                      ? t('accountDeletion.confirmBodyNamed', { who, defaultValue: '{{who}} and everything on it will be deleted. You will be signed out and this cannot be undone.' })
                      : t('accountDeletion.confirmBody', 'Your account and everything on it will be deleted. You will be signed out and this cannot be undone.')}
                  </p>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button type="button" disabled={busy} onClick={() => { setStep('review'); setError(false); }} className={NEUTRAL_BUTTON}>
                      {t('accountDeletion.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-busy={busy || undefined}
                      onClick={() => void submit()}
                      className={RED_BUTTON}
                      style={RED_STYLE}
                    >
                      {t(busy ? 'accountDeletion.busy' : 'accountDeletion.confirm')}
                    </button>
                  </div>
                </div>
              )}

              {error && <p role="alert" className="text-sm" style={{ color: '#ef4444' }}>{t('accountDeletion.error')}</p>}
            </>
          )}
        </section>
        )}
      </div>
    </main>
  );
}
