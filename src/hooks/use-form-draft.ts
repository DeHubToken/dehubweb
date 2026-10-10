import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushDrafts, readDraft, writeDraft, clearDraft } from '@/lib/draft-cache';
import { useAccountDraftKey } from './use-draft-state';

export interface FormDraftControls { clear: () => void; }

/** Explicit multi-field snapshots; only the listed, non-secret fields are stored. */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  apply: (saved: Partial<T>) => void,
): FormDraftControls {
  const scope = useAccountDraftKey(`form:${key}`);
  const initial = useRef(values);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const skipFirstWrite = useRef(true);
  const cleared = useRef<string | null>(null);
  const snapshot = JSON.stringify(values);

  useLayoutEffect(() => {
    skipFirstWrite.current = true;
    cleared.current = null;
    const raw = scope ? readDraft(scope) : '';
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          applyRef.current(saved);
          return;
        }
      } catch { /* Malformed data must not break the form. */ }
      if (scope) clearDraft(scope);
    }
    applyRef.current(initial.current);
  }, [scope]);

  useEffect(() => {
    // Restore runs before paint; the mount's empty snapshot must never erase it.
    if (skipFirstWrite.current) { skipFirstWrite.current = false; return; }
    if (!scope || cleared.current === snapshot) return;
    cleared.current = null;
    const empty = Object.values(values).every(v => v === '' || v == null || (Array.isArray(v) && !v.length));
    if (empty) clearDraft(scope);
    else writeDraft(scope, snapshot);
    flushDrafts();
  }, [scope, snapshot]);
  useEffect(() => flushDrafts, []);
  return { clear: () => {
    cleared.current = snapshot;
    if (scope) { clearDraft(scope); flushDrafts(); }
  } };
}
