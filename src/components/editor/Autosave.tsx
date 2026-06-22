/**
 * Background autosave: persists the current project to IndexedDB when the
 * editable slice changes. Hydrates last project on mount.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { getLastProjectId, loadProject, saveProject, setLastProjectId } from "@/lib/editor/projectStore";

export function Autosave() {
  const hydrated = useRef(false);

  // Hydrate last project once.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    (async () => {
      const lastId = getLastProjectId();
      if (!lastId) return;
      try {
        const snap = await loadProject(lastId);
        if (snap) useEditorStore.getState().loadSnapshot(snap);
      } catch (e) {
        console.warn("[editor] failed to load last project", e);
      }
    })();
  }, []);

  // Subscribe to editable slice changes and debounce-save.
  useEffect(() => {
    let t: number | null = null;
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (
        state.tracks === prev.tracks &&
        state.clips === prev.clips &&
        state.settings === prev.settings &&
        state.projectTitle === prev.projectTitle &&
        state.projectId === prev.projectId
      ) return;
      if (t) window.clearTimeout(t);
      t = window.setTimeout(async () => {
        try {
          const snap = useEditorStore.getState().toSnapshot();
          await saveProject(snap);
          setLastProjectId(snap.id);
        } catch (e) {
          console.warn("[editor] autosave failed", e);
        }
      }, 700);
    });
    return () => { unsub(); if (t) window.clearTimeout(t); };
  }, []);

  return null;
}
