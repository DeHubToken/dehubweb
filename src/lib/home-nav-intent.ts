/**
 * What a click on a Home nav entry is asking the home feed to do.
 *
 * Home used to refetch the whole feed on the very first click while you were
 * already on it, which made the nav Home button feel markedly slower than the
 * feed's own tab strip (a cheap filter switch). The first click now only
 * returns the page to the top; a further click, without leaving home in
 * between, refreshes.
 *
 * - `navigate`    — not on home; the click is just a move.
 * - `scrollToTop` — first click while on home. No network.
 * - `refresh`     — a further click while still on home.
 */
export type HomeNavIntent = 'navigate' | 'scrollToTop' | 'refresh';

// Module state rather than component state on purpose: the sidebar and the
// mobile bottom bar are two separate Home buttons for one feed, and a click on
// either should arm the other.
let armed = false;

export function resolveHomeNavIntent(onHome: boolean): HomeNavIntent {
  if (!onHome) {
    armed = false;
    return 'navigate';
  }
  const intent: HomeNavIntent = armed ? 'refresh' : 'scrollToTop';
  armed = true;
  return intent;
}

/** Leaving home disarms it, so coming back never lands on a refetching click. */
export function disarmHomeNavIntent(): void {
  armed = false;
}
