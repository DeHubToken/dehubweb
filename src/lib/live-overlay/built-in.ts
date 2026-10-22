import type { PublicOverlay } from './types';

// On the boot path (the live card reads it); keep the rest of the registry off it.

/** Kinds that replace the built-in corner celebration, so a gift never lands twice. */
export const REPLACES_BUILT_IN_CELEBRATION: readonly string[] = ['tip_alert'];

export function overlayOwnsCelebration(overlay: Pick<PublicOverlay, 'widgets'> | undefined | null): boolean {
  return !!overlay?.widgets.some((w) => w.enabled && REPLACES_BUILT_IN_CELEBRATION.includes(w.kind));
}
