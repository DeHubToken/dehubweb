/**
 * Responsive lanes of selected clips above the email-first login. The drawer and
 * phone screen share the catalogue, with a new order on each mount.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginClipLanes } from '@/lib/login-clip-lanes';
import { LOGIN_CLIP_IDS } from './login-clip-assets';
import { useIsMobile } from '@/hooks/use-mobile';
import '@/styles/login-stack.css';

type ClipName = typeof LOGIN_CLIP_IDS[number];

/** Any of these counts as the tap that lets a blocked clip start. */
const GESTURES = ['pointerdown', 'touchend', 'keydown'] as const;

/**
 * Loads and plays only while on screen. A tile builds no <video> at all (no
 * element, no clip, no poster) until it is actually in view, so opening the
 * sheet costs only the handful of clips you can see; the rest are built as the
 * lanes drift them in. A <video> is not cheap even empty: Chrome gives each
 * one ~100 elements of built-in controls to style, and 16 of them in the
 * opening frame were most of the delay between tap and sheet. Until its first
 * frame is ready the tile stays plain; the clip then fades in over it. Once built, a clip stays so drifting back does not refetch.
 *
 * Clips play for everyone. Reduced motion only stops the lanes drifting
 * (login-stack.css): it used to swap every clip for its still frame, which is
 * what people with Reduce Motion or Windows' "Animation effects" off saw.
 * When the browser refuses to start a clip on its own (iPhone Low Power Mode),
 * the first tap or key press anywhere starts it.
 */
function Clip({ name }: { name: ClipName }) {
  const tileRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const visibleRef = useRef(false);
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    // Older engines (and jsdom) have no observer: treat every tile as visible.
    if (typeof IntersectionObserver === 'undefined') { setLoaded(true); setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setLoaded(true);
    });
    io.observe(tile);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    visibleRef.current = visible;
    const video = ref.current;
    if (!video || !loaded) return;
    // React does not reflect `muted` as an attribute, and Safari refuses to
    // autoplay a video it cannot see is muted.
    video.muted = true;
    if (!visible) { video.pause(); return; }
    let cancelled = false;
    let retry: (() => void) | null = null;
    const stopRetry = () => {
      if (!retry) return;
      for (const type of GESTURES) document.removeEventListener(type, retry, true);
      retry = null;
    };
    // Older engines (and jsdom) return nothing from play() rather than a promise.
    video.play()?.catch?.((error: unknown) => {
      if (cancelled || (error as { name?: string })?.name !== 'NotAllowedError') return;
      retry = () => {
        stopRetry();
        if (visibleRef.current) void video.play()?.catch?.(() => {});
      };
      for (const type of GESTURES) document.addEventListener(type, retry, { capture: true, passive: true });
    });
    return () => { cancelled = true; stopRetry(); };
  }, [loaded, visible]);
  return (
    <div ref={tileRef} className="login-stack__tile">
      {loaded && (
        <video
          ref={ref}
          src={`/login-stack/${name}.mp4`}
          poster={`/login-stack/${name}.jpg`}
          onLoadedData={() => setReady(true)}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          className={ready ? 'login-stack__video is-ready' : 'login-stack__video'}
        />
      )}
    </div>
  );
}

function Lane({ clips, reverse }: { clips: ClipName[]; reverse?: boolean }) {
  return (
    <div className={reverse ? 'login-stack__lane login-stack__lane--down' : 'login-stack__lane'}>
      {[...clips, ...clips].map((name, i) => <Clip key={i} name={name} />)}
    </div>
  );
}

/** Desktop shows four lanes; phones keep two. */
const DESKTOP_LANES = 4;

/** A step further into signing in (the 2FA code) keeps the wall and the logo and only changes the words. */
export interface LoginStackHeadline {
  top: string;
  accent: string;
}

export function LoginShortsStack({ headline }: { headline?: LoginStackHeadline } = {}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const count = DESKTOP_LANES;
  const [lanes] = useState(() => loginClipLanes(LOGIN_CLIP_IDS, Math.random, 12));
  const selected = [...lanes.first, ...lanes.second];
  const perLane = Math.ceil(selected.length / count);
  // Phones keep two lanes of four so they drift at the same speed as before.
  const columns = isMobile
    ? [selected.slice(0, 4), selected.slice(4, 8)]
    : Array.from({ length: count }, (_, i) => selected.slice(i * perLane, (i + 1) * perLane));
  return (
    <div className="login-stack" data-login-stack>
      <div className="login-stack__lanes" aria-hidden="true">
        {columns.map((clips, index) => <Lane key={index} clips={clips} reverse={index % 2 === 1} />)}
      </div>
      <div className="login-stack__title">
        {/* Riftn wordmark as a neon sign, just above the headline, over the clips. */}
        <div className="login-stack__logo" role="img" aria-label="Riftn">
          <span className="login-stack__logo-mark" />
        </div>
        <h2 className="login-stack__headline text-white">
          {headline?.top ?? t('loginStack.headlineTop', 'You will own everything')}
          <span className="login-stack__accent">{headline?.accent ?? t('loginStack.headlineAccent', 'and be happy.')}</span>
        </h2>
      </div>
    </div>
  );
}

export default LoginShortsStack;
