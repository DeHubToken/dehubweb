/**
 * The top half of the phone sign-in sheet: three short clips fanned like a
 * hand of cards, hearts floating off the front one, and the headline.
 *
 * Phone only (LoginModal renders it below 768px on the options step); the
 * desktop sheet is unchanged. The clips are cut from the creator page hero and
 * ship from /login-stack, so nothing here depends on the feed (no network
 * call, no chance of a mature post on the sign-in screen).
 *
 * Its own chunk: LoginModal sits in the entry bundle and lazy-loads this.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dehubMark from '@/assets/dehub-logo-center.png';
import '@/styles/login-stack.css';

const CLIPS = {
  left: { src: '/login-stack/left.mp4', poster: '/login-stack/left.jpg' },
  front: { src: '/login-stack/front.mp4', poster: '/login-stack/front.jpg' },
  right: { src: '/login-stack/right.mp4', poster: '/login-stack/right.jpg' },
} as const;

function Clip({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React does not reflect `muted` as an attribute, and Safari refuses to
    // autoplay a video it cannot see is muted.
    video.muted = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Older engines (and jsdom) return nothing from play() rather than a promise.
    void video.play()?.catch?.(() => {});
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      className="login-stack__video"
    />
  );
}

const Heart = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 2.9 1.5-1.8 3-2.9 5.1-2.9 3.8 0 6 3.8 4.5 7.2C19.5 16.4 12 21 12 21z" />
  </svg>
);

export function LoginShortsStack() {
  const { t } = useTranslation();
  return (
    <div className="login-stack" data-login-stack>
      <div className="login-stack__cards" aria-hidden="true">
        <div className="login-stack__card login-stack__card--left"><Clip {...CLIPS.left} /></div>
        <div className="login-stack__card login-stack__card--right"><Clip {...CLIPS.right} /></div>
        <div className="login-stack__front">
          <div className="login-stack__card login-stack__card--front">
            <Clip {...CLIPS.front} />
            <div className="login-stack__shade" />
            <div className="login-stack__meta">
              <span className="login-stack__handle">
                <img src={dehubMark} alt="" className="login-stack__avatar" />
                @dehub
              </span>
              <span className="login-stack__tip">
                <img src={dehubMark} alt="" />
                {t('loginStack.tip', 'Tip DHB')}
              </span>
            </div>
          </div>
          <Heart className="login-stack__heart login-stack__heart--1" />
          <Heart className="login-stack__heart login-stack__heart--2" />
          <Heart className="login-stack__heart login-stack__heart--3" />
        </div>
      </div>
      <h2 className="login-stack__headline text-white">
        {t('loginStack.headlineTop', 'You will own everything')}
        <span className="login-stack__accent">{t('loginStack.headlineAccent', 'and be happy.')}</span>
      </h2>
    </div>
  );
}

export default LoginShortsStack;
