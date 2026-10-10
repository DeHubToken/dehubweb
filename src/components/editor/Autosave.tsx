/**
 * Project autosave with synchronous recovery before IndexedDB commits.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useLayoutEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { loadProject, saveProject, setLastProjectId } from '@/lib/editor/projectStore';
import { useAccountDraftKey } from '@/hooks/use-draft-state';
import { completeEditorRecovery, lastRecoveryProject, readEditorRecovery, writeEditorRecovery } from '@/lib/editor/draftRecovery';
import type { ProjectSnapshot } from '@/lib/editor/types';

export function Autosave() {
  const scope = useAccountDraftKey('editor:recovery') ?? 'guest|editor:recovery';
  const previousScope = useRef<string | null>(null);
  useLayoutEffect(() => {
    let closed = false;
    let changed = false;
    let timer: number | undefined;
    let pending: ProjectSnapshot | null = null;
    let saves = Promise.resolve();
    if (previousScope.current && previousScope.current !== scope) useEditorStore.getState().newProject();
    previousScope.current = scope;
    const lastId = lastRecoveryProject(scope);
    const recovery = lastId ? readEditorRecovery(scope, lastId) : null;
    if (recovery) useEditorStore.getState().loadSnapshot(recovery);
    const persist = (snapshot: ProjectSnapshot) => {
      saves = saves.then(async () => {
        await saveProject(snapshot);
        completeEditorRecovery(scope, snapshot);
      }).catch(error => console.warn('[editor] autosave failed', error));
    };
    const flush = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      if (pending) { const snapshot = pending; pending = null; persist(snapshot); }
    };
    const remember = (snapshot: ProjectSnapshot) => {
      // Switching projects must also flush the project being left behind.
      if (pending && pending.id !== snapshot.id) flush();
      writeEditorRecovery(scope, snapshot);
      setLastProjectId(snapshot.id);
      pending = snapshot;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, 700);
    };
    if (recovery) remember(recovery);
    else if (lastId) {
      void loadProject(lastId).then(snapshot => {
        if (!closed && !changed && snapshot) useEditorStore.getState().loadSnapshot(snapshot);
      }).catch(error => console.warn('[editor] failed to load last project', error));
    }
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.tracks === prev.tracks && state.clips === prev.clips && state.settings === prev.settings
        && state.projectTitle === prev.projectTitle && state.projectId === prev.projectId) return;
      changed = true;
      remember(state.toSnapshot());
    });
    window.addEventListener('pagehide', flush);
    return () => {
      closed = true;
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [scope]);
  return null;
}
