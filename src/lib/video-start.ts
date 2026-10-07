import { recoveryForVideo } from './browser-playback-recovery';

export function cancelVideoPlayback(player: HTMLVideoElement | null): void {
  if (player) recoveryForVideo(player)?.stop();
}

/** A new user play request can recover a media element after a network error. */
export function requestVideoPlayback(
  player: Pick<HTMLVideoElement, 'error' | 'load' | 'play'>,
): Promise<void> {
  const recovery = recoveryForVideo(player);
  if (recovery) { recovery.start(); return Promise.resolve(); }
  if (player.error) player.load();
  return player.play();
}
