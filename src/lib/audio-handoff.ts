/**
 * Audio handoff pool
 * ==================
 * One live `<audio>` element — and the Web Audio graph around it — per audio
 * post, shared by every card that shows that post, so opening a post from the
 * feed does not restart the track.
 *
 * The sibling of `lib/video-handoff`, and for the same reason: opening a post
 * does not replace the feed. `PersistentPageCache` keeps the home page mounted
 * underneath while `SinglePostPage` renders a second card for the same post in
 * the overlay above it. Two independent players for one track meant the post
 * page always opened at 0:00 while the feed's copy carried on behind it —
 * whichever one held the audio was the one you could not see.
 *
 * Where this differs from video: an audio post's element is **never in the
 * document**. The canvas is what goes on screen; the element only makes the
 * sound. So there is no slot and no node to move — a claim here is purely the
 * right to drive the element, and the hand-off costs nothing at all. What must
 * move with it is the graph: `createMediaElementSource` may be called **once
 * per element** for the life of the page, and an element that has a source node
 * is only audible through it. So the source and analyser travel with the
 * element, and the card taking over adopts the chain rather than building one.
 *
 * The claim is a stack, innermost last: the post page's claim goes on top of
 * the feed's, and releasing it hands the element straight back down. That is
 * the trip back to the feed, and it is why the feed card — which never unmounts
 * on a cached page — must keep its claim the whole time.
 *
 * @module lib/audio-handoff
 */

import { registerOffDocumentMedia } from '@/lib/pause-media-in';

/** An element and whatever Web Audio nodes were built around it. */
export interface AudioHandoffGraph {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
}

/** A card asking to drive the track, with the node that says which page it is on. */
interface Claim {
  token: object;
  anchor: () => Node | null;
}

interface Entry {
  /** Null until a card actually builds a player — a claim alone loads nothing. */
  graph: AudioHandoffGraph | null;
  /** Cards asking to drive this track, innermost claim last. */
  claims: Claim[];
  /** Undoes the element's registration with the page cache. */
  unregister: (() => void) | null;
  /** Pending disposal, cancelled if the track is reclaimed in time. */
  parkTimer: ReturnType<typeof setTimeout> | null;
}

const pool = new Map<string, Entry>();

/**
 * Which page the element counts as being on: whichever card holds it now.
 *
 * The pool registers the element with the page cache, not the card, and this
 * is why. A card handing the player back on unmount cannot re-register it —
 * its own node is already gone and the card taking over has not rendered yet.
 * That gap is one React commit wide, and `PersistentPageCache` sweeps for
 * playing media inside it, so an element attributed by render would slip
 * through and keep playing on a page that is no longer on screen.
 */
function anchorOf(key: string): Node | null {
  const claims = pool.get(key)?.claims;
  const active = claims?.[claims.length - 1];
  return active ? active.anchor() : null;
}

/**
 * Claim changes, per key. Every card showing the post subscribes: only the one
 * holding the element may drive it, so each needs to know when that flips —
 * otherwise the feed card and the post card would both write `muted`, both
 * forward play/pause, and both claim the media session.
 */
const watchers = new Map<string, Set<() => void>>();

function notify(key: string) {
  watchers.get(key)?.forEach((fn) => fn());
}

/** Subscribe to claim changes for `key`. Returns the unsubscribe. */
export function subscribeHandoffAudio(key: string, fn: () => void): () => void {
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
 * How long an unclaimed track is kept alive before being torn down.
 *
 * It has to outlive the gap between the old card releasing and the new one
 * claiming. Usually there is no gap (the feed still holds its claim), but a
 * standalone post route mounts behind `React.lazy`, so on a cold chunk the two
 * land in different tasks.
 */
const PARK_MS = 2000;

function dispose(key: string) {
  const entry = pool.get(key);
  if (!entry) return;
  if (entry.parkTimer) clearTimeout(entry.parkTimer);
  pool.delete(key);

  entry.unregister?.();
  const graph = entry.graph;
  if (!graph) return;
  graph.el.pause();
  graph.el.removeAttribute('src');
  // Detach from the SHARED context — never close it, other visualizers are on it.
  graph.source?.disconnect();
  graph.analyser?.disconnect();
}

function park(key: string) {
  const entry = pool.get(key);
  if (!entry || entry.parkTimer) return;
  entry.parkTimer = setTimeout(() => dispose(key), PARK_MS);
}

/** Ask to drive the track for `key`. Returns the token that releases the claim. */
export function claimHandoffAudio(key: string, anchor: () => Node | null): object {
  let entry = pool.get(key);
  if (!entry) {
    entry = { graph: null, claims: [], unregister: null, parkTimer: null };
    pool.set(key, entry);
  }
  if (entry.parkTimer) {
    clearTimeout(entry.parkTimer);
    entry.parkTimer = null;
  }
  const token = {};
  entry.claims.push({ token, anchor });
  notify(key);
  return token;
}

/**
 * Give up a claim. If it was the active one the track drops back to whichever
 * card claimed it before — that is the trip back to the feed. If nothing else
 * wants it, it is parked and then torn down.
 */
export function releaseHandoffAudio(key: string, token: object): void {
  const entry = pool.get(key);
  if (!entry) return;
  const i = entry.claims.findIndex((c) => c.token === token);
  if (i === -1) return;
  entry.claims.splice(i, 1);
  if (!entry.claims.length) park(key);
  notify(key);
}

/** Is `token` the claim currently driving `key`? */
export function isHandoffAudioActive(key: string, token: object | null): boolean {
  if (!token) return false;
  const entry = pool.get(key);
  return !!entry && entry.claims[entry.claims.length - 1]?.token === token;
}

/** The graph for `key`, for the card currently holding it. */
export function getHandoffAudio(key: string, token: object | null): AudioHandoffGraph | null {
  if (!isHandoffAudioActive(key, token)) return null;
  return pool.get(key)?.graph ?? null;
}

/** Put the graph this card built — or took back — into the pool. */
export function setHandoffAudio(key: string, token: object | null, graph: AudioHandoffGraph | null): void {
  if (!isHandoffAudioActive(key, token)) return;
  const entry = pool.get(key);
  if (!entry) return;
  entry.graph = graph;
  entry.unregister?.();
  entry.unregister = graph
    ? registerOffDocumentMedia(graph.el, () => anchorOf(key), key)
    : null;
}

/**
 * Hand the track out of the pool without tearing it down — the corner player
 * takes it and keeps playing across navigation, which is the one case where a
 * track is meant to outlive every card showing it.
 */
export function detachHandoffAudio(key: string): void {
  const entry = pool.get(key);
  if (!entry) return;
  entry.graph = null;
  entry.unregister?.();
  entry.unregister = null;
  if (entry.parkTimer) {
    clearTimeout(entry.parkTimer);
    entry.parkTimer = null;
  }
}
