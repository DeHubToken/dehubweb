/**
 * dehub.io/<name> for a name nobody owns, seen by a signed-out visitor.
 *
 * "Reserve now" holds the name for this browser for one minute while they
 * sign up (see src/lib/username-hold.ts). The hold ends when they finish sign
 * up, tap "Let it go", close the page, or the minute runs out. Signed-in
 * visitors never see this: they get the plain "not found" page.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AuthContext, LoginSheetContext } from '@/contexts/AuthContext';
import { currentHold, releaseUsername, reserveUsername } from '@/lib/username-hold';

export type ReserveState = 'avail' | 'held' | 'ended' | 'busy';

interface Props {
  username: string;
  /** The name got taken while they looked: show the real profile / not found. */
  onTaken?: () => void;
  /** State gallery: render a state without touching the network. */
  preview?: { state: ReserveState; secondsLeft?: number };
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function UsernameReserve({ username, onTaken, preview }: Props) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const sheet = useContext(LoginSheetContext);
  const name = username.trim().replace(/^@+/, '').toLowerCase();

  const initial = (): { state: ReserveState; until: number } => {
    if (preview) return { state: preview.state, until: Date.now() + (preview.secondsLeft ?? 59) * 1000 };
    const hold = currentHold();
    return hold && hold.username === name ? { state: 'held', until: hold.expiresAt } : { state: 'avail', until: 0 };
  };
  const [{ state, until }, setHold] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);

  // Tick while a countdown is showing.
  useEffect(() => {
    if (preview || (state !== 'held' && state !== 'busy')) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state, preview]);

  const left = until - now;
  useEffect(() => {
    if (preview) return;
    if (state === 'held' && left <= 0) {
      releaseUsername();
      setHold({ state: 'ended', until: 0 });
    } else if (state === 'busy' && left <= 0) {
      setHold({ state: 'avail', until: 0 });
    }
  }, [state, left, preview]);

  // Closing the page lets the name go. Leaving it inside the app does too,
  // unless they are in the middle of signing up (sheet open) or just finished.
  const keepRef = useRef(false);
  keepRef.current = !!sheet?.isLoginModalOpen || !!auth?.isAuthenticated;
  useEffect(() => {
    if (preview) return;
    const onHide = () => { if (!keepRef.current) releaseUsername(); };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (!keepRef.current && currentHold()?.username === name) releaseUsername();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, preview]);

  const openSignUp = useCallback(() => auth?.openLoginModal?.(), [auth]);

  const reserve = useCallback(async () => {
    if (preview || pending) return;
    setPending(true);
    try {
      const res = await reserveUsername(name);
      if (res.held) {
        setNow(Date.now());
        setHold({ state: 'held', until: Date.parse(res.expiresAt) });
        openSignUp();
      } else if ('reason' in res && res.reason === 'held' && res.expiresAt) {
        setNow(Date.now());
        setHold({ state: 'busy', until: Date.parse(res.expiresAt) });
      } else {
        onTaken?.();
      }
    } catch {
      // Hold service unreachable: still let them sign up and pick the name there.
      openSignUp();
    } finally {
      setPending(false);
    }
  }, [name, pending, preview, openSignUp, onTaken]);

  const letGo = useCallback(() => {
    if (!preview) releaseUsername();
    setHold({ state: 'avail', until: 0 });
  }, [preview]);

  const eyebrow = {
    avail: t('profile.reserve.available', { defaultValue: 'Username available' }),
    held: t('profile.reserve.held', { defaultValue: 'Held for you' }),
    ended: t('profile.reserve.ended', { defaultValue: 'Hold ended' }),
    busy: t('profile.reserve.busy', { defaultValue: 'Being reserved' }),
  }[state];

  return (
    <div className="flex w-full max-w-[400px] flex-col items-center text-center" data-username-reserve={state}>
      <ThemedIcon icon={state === 'held' ? 'lock' : 'usernames'} alt="" className="h-[76px] w-[76px] object-contain" />
      <div className="mt-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">{eyebrow}</div>
      <h1
        className="mb-2.5 mt-3.5 max-w-full break-all font-extrabold leading-none tracking-[-0.035em] text-white"
        // Long names shrink to one line instead of wrapping a lone letter.
        style={{ fontSize: `min(64px, calc(min(100vw - 32px, 400px) / ${((name.length + 1) * 0.62).toFixed(2)}))` }}
        data-reserve-name
      >
        @{name}
      </h1>

      {state === 'held' || state === 'busy' ? (
        <div className="mb-1.5 mt-0.5 text-[40px] font-bold leading-tight tracking-[-0.02em] text-white tabular-nums" aria-live="polite" data-reserve-timer>
          {fmt(left)}
        </div>
      ) : null}

      <p className="mb-6 max-w-[340px] text-sm leading-relaxed text-zinc-400 [text-wrap:balance]">
        {state === 'avail' && t('profile.reserve.availableBody', { defaultValue: 'riftn.com/{{name}} is free right now. Reserve it and we hold it for one minute while you sign up.', name })}
        {state === 'held' && t('profile.reserve.heldBody', { defaultValue: 'Nobody else can take @{{name}} until the timer runs out. Finish sign up to keep it.', name })}
        {state === 'ended' && t('profile.reserve.endedBody', { defaultValue: 'Your minute ran out, so @{{name}} is open to everyone again. It is still free.', name })}
        {state === 'busy' && t('profile.reserve.busyBody', { defaultValue: 'Someone is signing up as @{{name}} right now. If they do not finish, it frees up when the timer ends.', name })}
      </p>

      {state === 'held' ? (
        <Button onClick={openSignUp} data-primary-cta className="h-[52px] w-full rounded-[14px] bg-white text-base font-bold text-black hover:opacity-90">
          {t('profile.reserve.finish', { defaultValue: 'Finish sign up' })}
        </Button>
      ) : (
        <Button
          onClick={reserve}
          disabled={pending || state === 'busy'}
          data-primary-cta
          className="h-[52px] w-full rounded-[14px] bg-white text-base font-bold text-black hover:opacity-90 disabled:opacity-60"
        >
          {state === 'ended'
            ? t('profile.reserve.again', { defaultValue: 'Reserve again' })
            : t('profile.reserve.cta', { defaultValue: 'Reserve now' })}
        </Button>
      )}

      {state === 'held' ? (
        <button type="button" onClick={letGo} className="mt-4 text-sm font-semibold text-white">
          {t('profile.reserve.letGo', { defaultValue: 'Let it go' })}
        </button>
      ) : (
        <div className="mt-4 text-sm font-medium text-zinc-400">
          {t('profile.reserve.haveAccount', { defaultValue: 'Have an account?' })}{' '}
          <button type="button" onClick={openSignUp} className="font-semibold text-white">
            {t('profile.reserve.signIn', { defaultValue: 'Sign in' })}
          </button>
        </div>
      )}
    </div>
  );
}

export default UsernameReserve;
