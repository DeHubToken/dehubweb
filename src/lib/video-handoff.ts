/**
 * Video handoff pool
 * ==================
 * One live `<video>` element per post, shared by every card that shows that
 * post, so opening a post from the feed does not restart the clip.
 *
 * Opening a video from the feed does not replace the feed — `PersistentPageCache`
 * keeps the home page mounted (and, from-feed, visible) underneath while
 * `SinglePostPage` renders a second `VideoCard` for the same post in the overlay
 * layer. Two independent `<video>` elements for one clip meant the post page
 * always started from 0:00 against a cold buffer while the feed's copy carried
 * on playing behind it — two downloads, two decoders, and whichever one held the
 * audio was the one you couldn't see.
 *
 * So the element is owned here rather than by either card. A card claims it into
 * a slot; the claim is a stack, so the post page's claim moves the node on top of
 * the feed's and going back hands it straight back down. The move is a plain
 * `appendChild` in the same task, which is the whole point: per the HTML spec the
 * "removed from a Document" steps await a stable state before pausing, so a node
 * that is re-inserted synchronously never sees them. Playback, buffer, position,
 * volume and mute all survive the navigation untouched — there is nothing to
 * restore, because nothing was lost.
 *
 * Deliberately NOT a portal: React re-creates a portal's DOM when its container
 * changes, which is exactly the remount being avoided here. React only ever sees
 * an empty slot `<div>`; the element inside it is ours.
 */

/** A card currently asking to display the element, innermost claim last. */
interface Claim {
  token: object;
  slot: HTMLElement;
}

interface Entry {
  el: HTMLVideoElement;
  claims: Claim[];
  /** Pending disposal, cancelled if the element is reclaimed in time. */
  parkTimer: ReturnType<typeof setTimeout> | null;
}

const pool = new Map<string, Entry>();

/**
 * Claim changes, per key. Every card showing a post subscribes: only the one
 * holding the element may drive it, so each needs to know when that flips —
 * otherwise the feed card and the post card would both write `muted`, both
 * re-apply their own `className`, and both count a view.
 */
const watchers = new Map<string, Set<() => void>>();

function notify(key: string) {
  watchers.get(key)?.forEach((fn) => fn());
}

/** Subscribe to claim changes for `key`. Returns the unsubscribe. */
export function subscribeHandoffVideo(key: string, fn: () => void): () => void {
  let set = watchers.get(key);
  if (!set) {
    set = new Set();
    watchers.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) watchers.delete(key);
  };
}

/**
 * How long an unclaimed element is kept alive before being torn down.
 *
 * It has to outlive the gap between the old card releasing and the new one
 * claiming. Usually there is no gap at all (the feed still holds its claim), but
 * a standalone post route mounts behind `React.lazy`, so on a cold chunk the two
 * land in different tasks. Short enough that a fast scroll past a video does not
 * leave decoders parked for long.
 */
const PARK_MS = 2000;

/** Cap on parked (unclaimed but not yet disposed) elements. */
const MAX_PARKED = 2;

const parked: string[] = [];

function createElement(): HTMLVideoElement {
  const el = document.createElement('video');
  el.playsInline = true;
  // iOS Safari honours the attribute, not the property, on older versions.
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  return el;
}

function dispose(key: string) {
  const entry = pool.get(key);
  if (!entry) return;
  if (entry.parkTimer) clearTimeout(entry.parkTimer);
  pool.delete(key);
  const i = parked.indexOf(key);
  if (i !== -1) parked.splice(i, 1);

  const { el } = entry;
  el.pause();
  el.remove();
  // Drop the source so the decoder and any in-flight range requests go with it.
  // removeAttribute + load() is the documented way to actually release it; just
  // clearing `.src` leaves the element pointed at the document URL.
  el.removeAttribute('src');
  el.load();
}

function park(key: string) {
  const entry = pool.get(key);
  if (!entry) return;
  // Detached, not destroyed: currentTime and the buffered ranges survive, so a
  // reclaim inside PARK_MS resumes where it left off instead of refetching.
  entry.el.remove();
  if (!parked.includes(key)) parked.push(key);
  while (parked.length > MAX_PARKED) dispose(parked[0]);
  entry.parkTimer = setTimeout(() => dispose(key), PARK_MS);
}

/**
 * Take ownership of the element for `key` and put it in `slot`. Returns the
 * element plus the token that releases this claim.
 */
export function claimHandoffVideo(key: string, slot: HTMLElement): { el: HTMLVideoElement; token: object } {
  let entry = pool.get(key);
  if (!entry) {
    entry = { el: createElement(), claims: [], parkTimer: null };
    pool.set(key, entry);
  }
  if (entry.parkTimer) {
    clearTimeout(entry.parkTimer);
    entry.parkTimer = null;
  }
  const i = parked.indexOf(key);
  if (i !== -1) parked.splice(i, 1);

  const token = {};
  entry.claims.push({ token, slot });
  // Synchronous, same-task move — see the note at the top of the file.
  if (entry.el.parentNode !== slot) slot.appendChild(entry.el);
  notify(key);
  return { el: entry.el, token };
}

/**
 * Give up a claim. If it was the active one the element drops back to whichever
 * card claimed it before (that is the trip back to the feed); if nothing else
 * wants it, it is parked and then torn down.
 */
export function releaseHandoffVideo(key: string, token: object) {
  const entry = pool.get(key);
  if (!entry) return;

  const i = entry.claims.findIndex((c) => c.token === token);
  if (i === -1) return;
  const wasActive = i === entry.claims.length - 1;
  entry.claims.splice(i, 1);
  // A background claim went away (a feed card unmounting while the post is up):
  // the element is not where that claim was, so there is nothing to move.
  if (!wasActive) return;

  const next = entry.claims[entry.claims.length - 1];
  if (next) {
    next.slot.appendChild(entry.el);
    notify(key);
    return;
  }
  park(key);
  notify(key);
}

/** Is `slot` the claim currently holding the element for `key`? */
export function isHandoffVideoActive(key: string, slot: HTMLElement | null): boolean {
  if (!slot) return false;
  const entry = pool.get(key);
  return !!entry && entry.el.parentNode === slot;
}
