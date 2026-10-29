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

/**
 * Loads and plays only while on screen. A tile fetches nothing (no clip, no
 * poster) until it is actually in view, so opening the sheet costs only the
 * handful of clips you can see; the rest load as the lanes drift them in.
 * Each clip fades in once its first frame is ready, over the empty tile.
 * Once loaded, its source stays so drifting back does not refetch.
 */
function Clip({ name }: { name: ClipName }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React does not reflect `muted` as an attribute, and Safari refuses to
    // autoplay a video it cannot see is muted.
    video.muted = true;
    // Reduced motion: still frames only, shown as they are.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setLoaded(true); setReady(true); return; }
    // Older engines (and jsdom) have no observer: treat every tile as visible.
    if (typeof IntersectionObserver === 'undefined') { setLoaded(true); setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setLoaded(true);
    });
    io.observe(video);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video || !loaded) return;
    // Older engines (and jsdom) return nothing from play() rather than a promise.
    if (visible) void video.play()?.catch?.(() => {});
    else video.pause();
  }, [loaded, visible]);
  return (
    <video
      ref={ref}
      src={loaded ? `/login-stack/${name}.mp4` : undefined}
      poster={loaded ? `/login-stack/${name}.jpg` : undefined}
      onLoadedData={() => setReady(true)}
      muted
      loop
      playsInline
      preload={loaded ? 'metadata' : 'none'}
      aria-hidden="true"
      tabIndex={-1}
      className={ready ? 'login-stack__video is-ready' : 'login-stack__video'}
    />
  );
}

function Lane({ clips, reverse }: { clips: ClipName[]; reverse?: boolean }) {
  return (
    <div className={reverse ? 'login-stack__lane login-stack__lane--down' : 'login-stack__lane'}>
      {[...clips, ...clips].map((name, i) => (
        <div key={i} className="login-stack__tile">
          <Clip name={name} />
        </div>
      ))}
    </div>
  );
}

/** Desktop shows four lanes; phones keep two. */
const DESKTOP_LANES = 4;

export function LoginShortsStack() {
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
      <h2 className="login-stack__headline text-white">
        {t('loginStack.headlineTop', 'You will own everything')}
        <span className="login-stack__accent">{t('loginStack.headlineAccent', 'and be happy.')}</span>
      </h2>
    </div>
  );
}

export default LoginShortsStack;
