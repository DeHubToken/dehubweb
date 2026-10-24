/**
 * The top half of the phone sign-in sheet: two lanes of short clips drifting
 * past in opposite directions (the feed already running), then the headline.
 * One clip is the AI restyle and says so; the rest are ordinary creator posts.
 *
 * Phone only (LoginModal renders it below 768px on the options step); the
 * desktop sheet is unchanged. The clips ship from /login-stack, so nothing here
 * depends on the feed (no network call, no chance of a mature post on the
 * sign-in screen). Creator clips are CC BY 4.0, credited in
 * public/login-stack/CREDITS.txt.
 *
 * Its own chunk: LoginModal sits in the entry bundle and lazy-loads this.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import '@/styles/login-stack.css';

type ClipName = 'concert' | 'street' | 'restyle' | 'bass' | 'skate' | 'friends' | 'drums' | 'vlog';

// Each lane lists its clips twice so the -50% scroll loops without a seam.
const LANE_A: ClipName[] = ['restyle', 'concert', 'street', 'bass'];
const LANE_B: ClipName[] = ['skate', 'friends', 'drums', 'vlog'];

/** Plays only while on screen, so at most a handful decode at once. */
function Clip({ name }: { name: ClipName }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React does not reflect `muted` as an attribute, and Safari refuses to
    // autoplay a video it cannot see is muted.
    video.muted = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Older engines (and jsdom) return nothing from play() rather than a promise.
    const play = () => { void video.play()?.catch?.(() => {}); };
    if (typeof IntersectionObserver === 'undefined') { play(); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) play();
      else video.pause();
    });
    io.observe(video);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={`/login-stack/${name}.mp4`}
      poster={`/login-stack/${name}.jpg`}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      tabIndex={-1}
      className="login-stack__video"
    />
  );
}

function Lane({ clips, reverse, restyleLabel }: { clips: ClipName[]; reverse?: boolean; restyleLabel: string }) {
  return (
    <div className={reverse ? 'login-stack__lane login-stack__lane--down' : 'login-stack__lane'}>
      {[...clips, ...clips].map((name, i) => (
        <div key={i} className="login-stack__tile">
          <Clip name={name} />
          {name === 'restyle' && (
            <span className="login-stack__ai">
              <Sparkles aria-hidden="true" />
              {restyleLabel}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function LoginShortsStack() {
  const { t } = useTranslation();
  const restyleLabel = t('loginStack.aiRestyle', 'AI restyle');
  return (
    <div className="login-stack" data-login-stack>
      <div className="login-stack__lanes" aria-hidden="true">
        <Lane clips={LANE_A} restyleLabel={restyleLabel} />
        <Lane clips={LANE_B} reverse restyleLabel={restyleLabel} />
      </div>
      <h2 className="login-stack__headline text-white">
        {t('loginStack.headlineTop', 'You will own everything')}
        <span className="login-stack__accent">{t('loginStack.headlineAccent', 'and be happy.')}</span>
      </h2>
    </div>
  );
}

export default LoginShortsStack;
