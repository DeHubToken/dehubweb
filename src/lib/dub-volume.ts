type VolumePlayer = { volume: number };
const mixes = new WeakMap<VolumePlayer, number>();

export function setDubMixActive(player: VolumePlayer, active: boolean, gain: number): void {
  if (active) mixes.set(player, gain);
  else mixes.delete(player);
}

/** Playback controls preserve the active dub's original-audio gain. */
export function applyVideoVolume(player: VolumePlayer, master: number): void {
  const target = Math.max(0, Math.min(1, master)) * (mixes.get(player) ?? 1);
  if (target === 0 ? player.volume !== 0 : Math.abs(player.volume - target) > 0.000001) player.volume = target;
}
