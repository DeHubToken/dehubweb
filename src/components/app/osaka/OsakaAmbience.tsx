import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * The Osaka soundtrack.
 *
 * A single streaming <audio> element plus the smallest control that can
 * honestly own it. Three constraints shaped this component:
 *
 * 1. AUTOPLAY IS NOT GRANTED. Unlike the background video (muted, therefore
 *    allowed), audible playback needs a user gesture unless the browser has
 *    already decided this origin has earned it (Chrome's Media Engagement
 *    Index). So the component ASKS to play, and if it is refused it arms a
 *    one-shot gesture listener and marks itself "armed" until the user's next
 *    click anywhere. No error, no nag, no autoplay-blocked toast.
 *
 * 2. THERE IS ALWAYS AN OFF SWITCH, and it is visible without hunting. Sound
 *    that a user cannot immediately stop is hostile, so the control is a fixed
 *    pill rather than something buried in Settings.
 *
 * 3. THE CHOICE STICKS. Muting is remembered in localStorage, so switching to
 *    the theme a second time does not start the track over someone's own
 *    music. It is stored per-device rather than synced to the account: this is
 *    a "what is playing in this room right now" decision, not a preference.
 *
 * The file streams progressively, so only the seconds actually played are
 * fetched. Nothing here is bundled: the track lives in /public.
 */

/**
 * The track is NOT in the repo (see the header of OsakaBackground.tsx for why),
 * so a fresh clone has no file here and that is the normal case. Same base path
 * as the backplate: set VITE_OSAKA_MEDIA_BASE to a CDN, or drop the file into
 * public/osaka locally.
 */
const MEDIA_BASE =
  (import.meta.env.VITE_OSAKA_MEDIA_BASE as string | undefined)?.replace(/\/+$/, '') || '/osaka';

const TRACK_SRC = `${MEDIA_BASE}/osaka-ambience.mp3`;
const MUTED_KEY = 'dehub.osaka.muted';

/** Target volume. Low on purpose: this is a room tone under a social feed, not
 *  a listening session. The Radio mini-player is where music goes loud. */
const TARGET_VOLUME = 0.38;
/** Per-tick volume step, at ~60Hz. Roughly a 1.2s fade either way. */
const FADE_STEP = 0.008;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function OsakaAmbience() {
  const { theme } = useAppTheme();
  if (theme !== 'osaka') return null;
  return <OsakaAmbienceControl />;
}

function OsakaAmbienceControl() {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const targetRef = useRef(0);

  const [muted, setMuted] = useState(readMuted);
  /** True when the browser refused playback and we are waiting on a gesture.
   *  Drives the "tap me" pulse, and nothing else. */
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** The file is not there at all. Distinct from `armed`: a gesture will never
   *  fix a 404, so the control has to disappear rather than pulse forever
   *  inviting a tap that cannot work. */
  const [missing, setMissing] = useState(false);

  /* ---- the element ------------------------------------------------------ */
  // Created once, imperatively. A JSX <audio> would be torn down and rebuilt by
  // any parent re-render, restarting the track from zero.
  useEffect(() => {
    const el = new Audio(TRACK_SRC);
    el.loop = true;
    el.preload = 'metadata';
    el.volume = 0;
    audioRef.current = el;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      setMissing(true);
      setArmed(false);
      setPlaying(false);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onError);
      if (fadeRef.current) cancelAnimationFrame(fadeRef.current);
      fadeRef.current = null;
      // Detach the source or the browser keeps streaming the file after the
      // theme has already changed.
      el.pause();
      el.removeAttribute('src');
      el.load();
      audioRef.current = null;
    };
  }, []);

  /* ---- fades ------------------------------------------------------------ */
  // One rAF loop drives volume in both directions and stops itself when it
  // arrives, so an idle player costs nothing.
  const runFade = useCallback(() => {
    if (fadeRef.current) return;
    const step = () => {
      const el = audioRef.current;
      if (!el) {
        fadeRef.current = null;
        return;
      }
      const target = targetRef.current;
      const delta = target - el.volume;
      if (Math.abs(delta) <= FADE_STEP) {
        el.volume = target;
        fadeRef.current = null;
        if (target === 0 && !el.paused) el.pause();
        return;
      }
      el.volume = Math.max(0, Math.min(1, el.volume + Math.sign(delta) * FADE_STEP));
      fadeRef.current = requestAnimationFrame(step);
    };
    fadeRef.current = requestAnimationFrame(step);
  }, []);

  const fadeTo = useCallback(
    (value: number) => {
      targetRef.current = value;
      runFade();
    },
    [runFade],
  );

  /* ---- start / stop ----------------------------------------------------- */
  const attemptPlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    void el
      .play()
      .then(() => {
        setArmed(false);
        fadeTo(TARGET_VOLUME);
      })
      .catch(() => {
        // Refused. Wait for a gesture rather than surfacing an error.
        setArmed(true);
      });
  }, [fadeTo]);

  // Opening move: try immediately unless the user muted it last time.
  useEffect(() => {
    if (muted) return;
    attemptPlay();
    // Intentionally mount-only. Re-running on `muted` would restart the track
    // every time the button is toggled; the toggle handler owns that path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While armed, the next gesture anywhere in the document starts playback.
  useEffect(() => {
    if (!armed || muted) return;
    const onGesture = () => attemptPlay();
    window.addEventListener('pointerdown', onGesture, { once: true, passive: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [armed, muted, attemptPlay]);

  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTED_KEY, next ? '1' : '0');
    } catch {
      /* private mode - the choice just does not survive the session */
    }
    if (next) {
      fadeTo(0);
      setArmed(false);
    } else {
      attemptPlay();
    }
  }, [muted, fadeTo, attemptPlay]);

  // No file, no control. A mute button for silence is worse than nothing.
  if (missing) return null;

  const live = playing && !muted;

  return (
    <button
      type="button"
      onClick={toggle}
      data-osaka-ambience=""
      data-live={live ? 'true' : 'false'}
      data-armed={armed && !muted ? 'true' : 'false'}
      aria-pressed={!muted}
      aria-label={muted ? t('osaka.ambienceOn') : t('osaka.ambienceOff')}
      title={muted ? t('osaka.ambienceOn') : t('osaka.ambienceOff')}
      className={cn(
        'fixed z-50 flex items-center gap-2.5 group',
        'bottom-16 left-3 md:bottom-[74px] md:left-5 lg:bottom-6 lg:left-5',
        'h-10 rounded-full pl-3 pr-3.5',
        'transition-transform duration-200 active:scale-[0.96]',
      )}
    >
      {live ? <Equaliser /> : muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      <span data-osaka-ambience-label="" className="text-[11px] font-medium tracking-wide whitespace-nowrap">
        {t('osaka.trackTitle')}
      </span>
    </button>
  );
}

/** Four bars on staggered CSS animations. Kept as an element rather than an
 *  icon so it can key off the same neon token the rest of the chrome uses, and
 *  so `prefers-reduced-motion` can flatten it to a static level meter (see
 *  styles/osaka-theme.css). */
function Equaliser() {
  return (
    <span data-osaka-eq="" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
