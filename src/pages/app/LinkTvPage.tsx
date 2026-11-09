/**
 * /link: sign a Riftn TV in from the browser.
 *
 * The TV app shows an eight-character code and says "or visit riftn.com/link".
 * This is that page, and it is the web twin of the phone app's
 * Settings → Privacy → Sign in a TV (dehub-mobile screens/SignInTvScreen).
 *
 * Two steps on purpose: type the code, then see which device it is and
 * approve. What is being authorised is a full session on a device the person
 * may not be able to see, and the only thing between that and a device-code
 * phishing attack is a person reading "Riftn TV (SHIELD Android TV)" and
 * deciding whether that is the television in front of them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageEmpty, PageIsland, PageSection, KitButton } from '@/components/app/page-kit/PageKit';
import { useAuth } from '@/contexts/AuthContext';
import {
  isCompletePairingCode,
  lookupTvPairing,
  normalisePairingCode,
  resolveTvPairing,
  type TvPairingTarget,
} from '@/lib/api/dehub/tv-pair';

type Phase = 'entry' | 'confirm' | 'approved' | 'refused';

export default function LinkTvPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => normalisePairingCode(params.get('code') ?? ''));
  const [phase, setPhase] = useState<Phase>('entry');
  const [target, setTarget] = useState<TvPairingTarget | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'not-found' | 'network' | 'failed' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const complete = isCompletePairingCode(code);

  // Look the code up the moment it is complete: it saves a press, and it puts
  // the device's name on screen before anyone has decided anything.
  useEffect(() => {
    if (!isAuthenticated || phase !== 'entry' || !complete) return;
    let cancelled = false;
    setChecking(true);
    setProblem(null);
    lookupTvPairing(code)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setTarget(found);
          setPhase('confirm');
        } else {
          setProblem('not-found');
        }
      })
      .catch(() => !cancelled && setProblem('network'))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [code, complete, isAuthenticated, phase]);

  const decide = useCallback(
    async (approve: boolean) => {
      setBusy(true);
      setProblem(null);
      try {
        await resolveTvPairing(code, approve);
        setPhase(approve ? 'approved' : 'refused');
      } catch {
        setProblem('failed');
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  const restart = () => {
    setCode('');
    setTarget(null);
    setProblem(null);
    setPhase('entry');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('linkTv.seoTitle', { defaultValue: 'Sign in to Riftn on your TV | Riftn' })}
        description={t('linkTv.seoDescription', {
          defaultValue: 'Enter the code shown on your TV to sign in to the Riftn TV app with your account. No typing on a remote.',
        })}
        url="https://riftn.com/link"
        image="https://riftn.com/og/link.jpg"
        noindex
      />
      <PageIsland back icon="tv" title={t('linkTv.title', { defaultValue: 'Sign in a TV' })} />
      <PageBody measure>
        {!isAuthenticated ? (
          <PageEmpty
            icon="tv"
            title={t('linkTv.signInTitle', { defaultValue: 'Sign in to connect your TV' })}
            body={t('linkTv.signInBody', {
              defaultValue: 'Sign in here first. Then type the code your TV is showing and it signs in as you.',
            })}
            action={
              <KitButton onClick={() => openLoginModal?.()}>
                {t('linkTv.signIn', { defaultValue: 'Sign in' })}
              </KitButton>
            }
          />
        ) : phase === 'approved' ? (
          <PageEmpty
            icon="tv"
            title={t('linkTv.doneTitle', { defaultValue: 'Your TV is signed in' })}
            body={t('linkTv.doneBody', {
              defaultValue: 'It should switch over in a few seconds. You can sign it out any time from Settings, Active sessions.',
            })}
            action={
              <KitButton variant="quiet" onClick={restart}>
                {t('linkTv.another', { defaultValue: 'Sign in another TV' })}
              </KitButton>
            }
          />
        ) : phase === 'refused' ? (
          <PageEmpty
            icon="tv"
            title={t('linkTv.refusedTitle', { defaultValue: 'Code refused' })}
            body={t('linkTv.refusedBody', { defaultValue: 'That device was not signed in. Nothing else changed.' })}
            action={
              <KitButton variant="quiet" onClick={restart}>
                {t('linkTv.tryAnother', { defaultValue: 'Enter a different code' })}
              </KitButton>
            }
          />
        ) : phase === 'confirm' && target ? (
          <PageSection>
            <p className="text-[13px] text-zinc-400">{t('linkTv.confirmEyebrow', { defaultValue: 'Code {{code}} belongs to', code })}</p>
            <p className="mt-1 text-xl font-semibold text-white">{target.deviceName}</p>
            <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-[13px] leading-relaxed text-white">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {t('linkTv.warning', {
                  defaultValue:
                    'Only approve a code that is on a TV in front of you. If someone sent you this code, refuse it: approving gives them your account on their screen.',
                })}
              </span>
            </div>
            {problem === 'failed' && (
              <p className="mt-3 text-[13px] text-red-400">
                {t('linkTv.failed', { defaultValue: 'That did not go through. The code may have expired; get a new one on the TV.' })}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <KitButton onClick={() => void decide(true)} disabled={busy} className="sm:flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('linkTv.approve', { defaultValue: 'Sign in this TV' })}
              </KitButton>
              <KitButton variant="quiet" onClick={() => void decide(false)} disabled={busy} className="sm:flex-1">
                {t('linkTv.refuse', { defaultValue: "That's not my TV" })}
              </KitButton>
            </div>
          </PageSection>
        ) : (
          <PageSection>
            <label htmlFor="tv-code" className="text-[15px] font-semibold text-white">
              {t('linkTv.entryTitle', { defaultValue: 'Enter the code on your TV' })}
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
              {t('linkTv.entryBody', {
                defaultValue: 'Open Riftn TV and choose Sign in. The code is eight letters and numbers and lasts two minutes.',
              })}
            </p>
            <input
              ref={inputRef}
              id="tv-code"
              autoFocus
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              value={code}
              onChange={(e) => {
                setProblem(null);
                setCode(normalisePairingCode(e.target.value));
              }}
              placeholder="ABCD-1234"
              maxLength={9}
              className="mt-4 h-16 w-full rounded-xl border border-white/15 bg-black/30 text-center font-mono text-3xl font-semibold uppercase tracking-[0.25em] text-white placeholder:text-zinc-600 focus:border-white/40 focus:outline-none"
            />
            <div className="mt-3 min-h-5 text-[13px]">
              {checking ? (
                <span className="inline-flex items-center gap-2 text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('linkTv.checking', { defaultValue: 'Checking the code' })}
                </span>
              ) : problem === 'not-found' ? (
                <span className="text-red-400">
                  {t('linkTv.notFound', { defaultValue: 'That code is wrong or has expired. Check the TV for a fresh one.' })}
                </span>
              ) : problem === 'network' ? (
                <span className="text-red-400">
                  {t('linkTv.network', { defaultValue: 'Could not reach Riftn. Check your connection and try again.' })}
                </span>
              ) : null}
            </div>
          </PageSection>
        )}
      </PageBody>
    </div>
  );
}
