/**
 * The home feed is canonically served at `/app`, but dehub.io also serves it
 * directly at the site root `/` (no redirect — the root *is* the app home).
 * Use this wherever a check means "am I currently on the home feed" so both
 * URLs behave identically (nav highlight, scroll-to-top, post-overlay stacking).
 *
 * NOTE: deliberately does NOT include `/videos` / `/shorts` (those are the
 * feed-tab URLs, handled separately by isHomeFeedRoute / tabFromPathname).
 */
export const isHomePath = (pathname: string): boolean =>
  pathname === '/app' || pathname === '/';
