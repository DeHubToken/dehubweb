import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "@/hooks/use-draft-state";
import { createReusableElementStore } from "./reusableElements";
import type { DesignClipboard } from "./designClipboard";
const prefix = "dehub-reusable-elements:v1:";
const store = createReusableElementStore(key => typeof window === "undefined" ? null : window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key?.startsWith(prefix)) store.reload(event.key); });
export function useReusableElements() {
  const key = prefix + useAccountDraftKey("preferences"), items = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, items, canUndo: store.canUndo(key), canRedo: store.canRedo(key), undo: () => store.undo(key), redo: () => store.redo(key), create: (name: string, source: DesignClipboard) => store.create(key, name, source), rename: (id: string, name: string) => store.rename(key, id, name), replace: (id: string, source: DesignClipboard) => store.replace(key, id, source), remove: (id: string) => store.remove(key, id) };
}
