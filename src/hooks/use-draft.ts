/**
 * useDraft
 * ========
 * useState for composer text, backed by the shared draft cache.
 *
 * Drop-in: `const [text, setText] = useDraft(key, fallback)`. Pass a null key
 * and it degrades to plain useState, so a composer with nothing stable to key
 * on keeps exactly its old behaviour.
 *
 * The key is a SCOPE, not an id — see lib/draft-cache for why DM drafts hang
 * off the peer address rather than the conversation id.
 *
 * @module hooks/use-draft
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushDrafts, readDraft, subscribeDrafts, writeDraft } from '@/lib/draft-cache';

type Setter = (next: string | ((prev: string) => string)) => void;

export function useDraft(key: string | null | undefined, fallback = ''): [string, Setter] {
  const [text, setText] = useState(() => (key ? readDraft(key) : '') || fallback);

  // The live key, read inside the setter without making it change identity on
  // every conversation switch (the composer memoizes callbacks against it).
  const keyRef = useRef(key);
  keyRef.current = key;

  // What this composer last put into the store, so its own writes can be told
  // apart from someone else's.
  const lastSynced = useRef(text);

  // Swap threads without unmounting: park the outgoing draft, load the incoming
  // one. Guarded on an actual change so it does not fire on every render.
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    const incoming = key ? readDraft(key) : '';
    lastSynced.current = incoming;
    setText(incoming);
  }, [key]);

  const set = useCallback<Setter>((next) => {
    setText((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      lastSynced.current = value;
      if (keyRef.current) writeDraft(keyRef.current, value);
      return value;
    });
  }, []);

  /*
   * Adopt a write to this scope that did not come from here — a send that
   * failed handing the message back into the box being the case that matters.
   * Without this the store holds the text and the composer stays empty, which
   * is the original bug wearing a different hat.
   *
   * Only non-empty values are adopted: an external *clear* must never blank a
   * composer someone is actively typing into (a second tab, mid-sentence).
   */
  useEffect(() => {
    if (!key) return;
    return subscribeDrafts(() => {
      const stored = readDraft(key);
      if (!stored || stored === lastSynced.current) return;
      lastSynced.current = stored;
      setText(stored);
    });
  }, [key]);

  // A composer that unmounts (route change, thread closed) may never see the
  // idle callback fire, so push whatever is queued out on the way down.
  useEffect(() => flushDrafts, []);

  return [text, set];
}

/**
 * Read-only view of a scope's draft, for surfaces that show one they do not own
 * — the conversation list's "Draft: …" line. A saved draft the user cannot see
 * from the outside is indistinguishable from a lost one.
 */
export function useDraftText(key: string | null | undefined): string {
  const getSnapshot = useCallback(() => (key ? readDraft(key) : ''), [key]);
  return useSyncExternalStore(subscribeDrafts, getSnapshot, () => '');
}
