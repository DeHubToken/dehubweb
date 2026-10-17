import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "@/hooks/use-draft-state";
import { createEditorLibraryStore, EMPTY_EDITOR_LIBRARY, type EditorLibraryKind } from "./editorLibrary";
const prefix = "dehub-editor-library:v1:";
const store = createEditorLibraryStore(key => typeof window === "undefined" ? null : window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key?.startsWith(prefix)) store.reload(event.key); });
export function useEditorLibrary(kind: EditorLibraryKind) {
  const key = prefix + useAccountDraftKey("preferences");
  const state = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => EMPTY_EDITOR_LIBRARY);
  return { ...state[kind], toggle: (id: string) => store.toggle(key, kind, id), record: (id: string) => store.record(key, kind, id) };
}
