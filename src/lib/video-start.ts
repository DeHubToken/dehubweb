import { recoveryForVideo } from './browser-playback-recovery';
import { reloadVideoSource } from './hls-vod';

export function cancelVideoPlayback(player: HTMLVideoElement | null): void {
  if (player) recoveryForVideo(player)?.stop();
}

/** A new user play request can recover a media element after a network error. */
export function requestVideoPlayback(
  player: Pick<HTMLVideoElement, 'error' | 'load' | 'play'>,
): Promise<void> {
  const recovery = recoveryForVideo(player);
  if (recovery) { recovery.start(); return Promise.resolve(); }
  if (player.error) reloadVideoSource(player);
  return player.play();
}
