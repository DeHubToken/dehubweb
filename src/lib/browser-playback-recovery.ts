import { createPlaybackRecovery, playbackSourceIdentity, type PlaybackPhase } from './playback-recovery';

const recoveries = new WeakMap<object, ReturnType<typeof createPlaybackRecovery>>();
export const recoveryForVideo = (video: object) => recoveries.get(video);

export function attachPlaybackRecovery(video: HTMLVideoElement, options: {
  allowed: () => boolean;
  changed: (phase: PlaybackPhase) => void;
  postId: string;
  component: string;
}) {
  let previousTime = video.currentTime;
  const recovery = createPlaybackRecovery({
    ...options,
    play: async (reload, allowed) => {
      const position = video.currentTime;
      const duration = video.duration;
      if (reload || video.error) {
        video.load();
        // currentTime can be set before metadata; the browser applies it once
        // the new resource is seekable. Live streams stay at their live edge.
        if (position > 0 && Number.isFinite(duration) && position < duration) video.currentTime = position;
      }
      if (allowed()) await video.play();
    },
    pause: () => video.pause(),
    report: (event, detail) => {
      void import('./logger').then(({ logToBackend }) => logToBackend({
        level: event === 'failed' ? 'error' : 'info', component: options.component,
        message: `playback ${event}`,
        metadata: { ...detail, postId: options.postId, source: playbackSourceIdentity(video.currentSrc || video.src), code: video.error?.code, readyState: video.readyState, networkState: video.networkState },
      }, true)).catch(() => {});
    },
  });
  recoveries.set(video, recovery);
  const play = () => recovery.watch();
  const pause = () => { if (!recovery.replacing && !video.error && recovery.wanted) recovery.stop(); };
  const waiting = () => recovery.waiting();
  const error = () => recovery.fail(`media-${video.error?.code ?? 0}`);
  const progress = () => {
    if (!video.paused && video.currentTime !== previousTime) recovery.progress();
    previousTime = video.currentTime;
  };
  const playing = () => recovery.progress();
  const listeners = { play, pause, waiting, stalled: waiting, error, playing, timeupdate: progress, ended: pause };
  Object.entries(listeners).forEach(([name, listener]) => video.addEventListener(name, listener));
  if (!video.paused) { recovery.watch(); if (video.readyState >= 3) recovery.progress(); }
  return () => {
    Object.entries(listeners).forEach(([name, listener]) => video.removeEventListener(name, listener));
    if (recoveries.get(video) === recovery) recoveries.delete(video);
    recovery.stop();
  };
}
