/** Shared with the Immersive capsule: reveal downward from behind the pill. */
export const feedDrawerClosed = { height: 0, opacity: 0, y: -8 };
export const feedDrawerOpen = { height: 'auto', opacity: 1, y: 0 };
export const feedDrawerExit = { ...feedDrawerClosed, pointerEvents: 'none' as const };
export const feedDrawerTransition = (reduceMotion: boolean | null) => ({
  duration: reduceMotion ? 0 : 0.2,
  ease: 'easeOut' as const,
});
