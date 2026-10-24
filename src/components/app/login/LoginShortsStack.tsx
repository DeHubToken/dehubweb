/**
 * Two lanes of selected clips above the email-first login. The drawer and
 * phone screen share the catalogue, with a new order on each mount.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginClipLanes } from '@/lib/login-clip-lanes';
import { LOGIN_CLIP_IDS } from './login-clip-assets';
import '@/styles/login-stack.css';

type ClipName = typeof LOGIN_CLIP_IDS[number];

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

export function LoginShortsStack() {
  const { t } = useTranslation();
  const [lanes] = useState(() => loginClipLanes(LOGIN_CLIP_IDS));
  return (
    <div className="login-stack" data-login-stack>
      <div className="login-stack__lanes" aria-hidden="true">
        <Lane clips={lanes.first} />
        <Lane clips={lanes.second} reverse />
      </div>
      <h2 className="login-stack__headline text-white">
        {t('loginStack.headlineTop', 'You will own everything')}
        <span className="login-stack__accent">{t('loginStack.headlineAccent', 'and be happy.')}</span>
      </h2>
    </div>
  );
}

export default LoginShortsStack;
