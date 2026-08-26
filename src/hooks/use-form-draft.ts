/**
 * useFormDraft
 * ============
 * Keeps a multi-field form's in-progress values in the shared draft store, so
 * a half-filled form survives navigating away, a reload, or the tab closing —
 * the same guarantee the chat composers got, applied to the forms that take
 * real effort to fill in.
 *
 * These are the pages where losing it hurts most: bounty posting, launching a
 * coin, going live. All of them are plain lazy routes rather than cached pages,
 * so they unmount the moment the user goes to check something and come back
 * blank.
 *
 * Deliberately NOT a state container. The form keeps its own useStates and
 * passes a snapshot in, which means:
 *   - no page has to be restructured to adopt this,
 *   - what is saved is legible at the call site rather than implied, and
 *   - fields the form does not list simply are not persisted (a file input, an
 *     `isSubmitting` flag) instead of being persisted by accident.
 *
 * @module hooks/use-form-draft
 */

import { useEffect, useRef } from 'react';
import { flushDrafts, readDraft, writeDraft, clearDraft } from '@/lib/draft-cache';

/** Namespaced so a form draft can never collide with a chat scope. */
const formScope = (key: string) => `form:${key}`;

export interface FormDraftControls {
  /** Drop the saved draft. Call once the form has actually been submitted. */
  clear: () => void;
}

/**
 * @param key    Stable name for this form, e.g. `work-post`.
 * @param values Snapshot of the current field values, rebuilt each render.
 * @param apply  Called at most once, on mount, with a previously saved snapshot.
 *               Read defensively: a draft saved by an older build will be
 *               missing fields added since.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  apply: (saved: Partial<T>) => void,
): FormDraftControls {
  const scope = formScope(key);
  const restoredRef = useRef(false);

  // `apply` is almost always an inline arrow, so depending on it would re-run
  // the restore on every render. The mount pass is the only one that matters.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  if (!restoredRef.current) {
    // During the first render rather than in an effect: an effect restores a
    // tick later, which is long enough to see the empty form paint first.
    restoredRef.current = true;
    const raw = readDraft(scope);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<T>;
        if (saved && typeof saved === 'object') {
          // Queued, not called inline — applying during render would set state
          // on a component mid-render. A microtask still lands before paint.
          queueMicrotask(() => applyRef.current(saved));
        }
      } catch {
        // Unparseable draft: drop it rather than wedge the form on every load.
        clearDraft(scope);
      }
    }
  }

  // The store already coalesces its own writes onto idle, so serialising per
  // keystroke costs a JSON.stringify and no I/O.
  useEffect(() => {
    const isEmpty = Object.values(values).every(
      (v) => v === '' || v === null || v === undefined ||
        (Array.isArray(v) && v.length === 0),
    );
    if (isEmpty) {
      // Two cases collapse here. An untouched form must not write a draft, or
      // merely opening the page would leave an entry behind. And a form the
      // user deliberately emptied must not keep the old one, or clearing a
      // field would appear to work and then undo itself on the next visit.
      clearDraft(scope);
      return;
    }
    writeDraft(scope, JSON.stringify(values));
  });

  // A form left by navigation may never see the store's idle callback fire.
  useEffect(() => flushDrafts, []);

  return { clear: () => clearDraft(scope) };
}
