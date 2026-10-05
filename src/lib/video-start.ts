/** A new user play request can recover a media element after a network error. */
export function requestVideoPlayback(
  player: Pick<HTMLVideoElement, 'error' | 'load' | 'play'>,
): Promise<void> {
  if (player.error) player.load();
  return player.play();
}
