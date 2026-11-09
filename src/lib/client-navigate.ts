import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

/**
 * Client-side navigation for callers that live outside the React tree — today
 * that is TranslatableText, which renders post and comment bodies to plain DOM
 * and wires @mentions, hashtags, cashtags and internal dehub links by hand.
 *
 * This used to be `history.pushState({}, '', path)` followed by a synthetic
 * `popstate`. Two things were wrong with that:
 *
 *  - The empty state object erased the `idx` react-router keeps in
 *    `history.state` (verified on staging: `{ idx: 0 }` became `{}`).
 *    `hooks/use-history-nav-type` reads that index to tell a PUSH from a POP,
 *    and its only consumer is the mobile header's back button — which then
 *    lost its place and jumped to /app instead of stepping back one page.
 *  - A synthetic `popstate` told the router that a forward navigation was a
 *    back navigation.
 *
 * The router's own `navigate` is published here by <ClientNavigateBridge/>,
 * mounted once inside <BrowserRouter>.
 */
let routerNavigate: NavigateFunction | null = null;

/** Called by ClientNavigateBridge. Not for general use. */
export function setClientNavigate(fn: NavigateFunction | null): void {
  routerNavigate = fn;
}

/**
 * The router's navigate as one stable function (see hooks/use-stable-navigate).
 * Before the router mounts it falls back to a history step or a full load.
 */
export const stableNavigate = ((to: To | number, options?: NavigateOptions) => {
  if (routerNavigate) {
    if (typeof to === 'number') return routerNavigate(to);
    return routerNavigate(to, options);
  }
  if (typeof to === 'number') { window.history.go(to); return; }
  const href = typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`;
  if (options?.replace) window.location.replace(href);
  else window.location.assign(href);
}) as NavigateFunction;

export function clientNavigate(path: string): void {
  // Only paths on this site. Callers build these from post text, so a
  // `//host` or `javascript:` value must never reach the browser.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return;
  if (routerNavigate) {
    routerNavigate(path);
    return;
  }
  // No router mounted yet. A full load is the only honest fallback, and it
  // cannot leave history state inconsistent the way a hand-rolled push did.
  window.location.assign(path);
}
