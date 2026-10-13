/** One agent without a badge, rising evenly to 25 at Megalodon. */
export function agentCapForBadgeWeight(weight: number): number {
  const tier = Number.isFinite(weight) ? Math.max(0, Math.min(13, Math.floor(weight))) : 0;
  return 1 + Math.round((24 * tier) / 13);
}
