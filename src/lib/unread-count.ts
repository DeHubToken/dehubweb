/**
 * How an unread count is allowed to render.
 *
 * A "jump to latest" pill is a nudge, not a statistic — past a certain point
 * the exact figure tells the reader nothing they can act on, and a wrong figure
 * (a counter that ratcheted, a bad diff) turns into a very visible bug. Capping
 * the label keeps both cases legible.
 */
export const UNREAD_DISPLAY_CAP = 99;

export const formatUnreadCount = (count: number): string =>
  count > UNREAD_DISPLAY_CAP ? `${UNREAD_DISPLAY_CAP}+` : String(count);
