/**
 * The widget kinds this app knows how to draw.
 *
 * The stream API stores any well-formed kind, so a layout saved by a newer app
 * still loads here; a kind missing from this list is simply not drawn. These
 * names are a contract with dehub-mobile and with every saved overlay — rename
 * one and every creator who placed it loses it.
 */

export const OVERLAY_KINDS = [
  'tip_alert',
  'follow_alert',
  'subscribe_alert',
  'share_alert',
  'join_alert',
  'goal_bar',
  'top_supporters',
  'viewer_count',
  'text',
  'frame',
] as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[number];

export function isKnownKind(kind: string): kind is OverlayKind {
  return (OVERLAY_KINDS as readonly string[]).includes(kind);
}

export { REPLACES_BUILT_IN_CELEBRATION, overlayOwnsCelebration } from './built-in';

/**
 * Read a setting, falling back when it is missing or the wrong type.
 *
 * Overloaded rather than generic so the result is `string`, not the literal
 * type of the fallback: `setting(s, 'style', 'celebration')` must be allowed to
 * come back as 'banner'.
 */
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: string): string;
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: number): number;
export function setting(settings: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean;
export function setting(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: string | number | boolean,
): string | number | boolean {
  const value = settings?.[key];
  return typeof value === typeof fallback ? (value as string | number | boolean) : fallback;
}
