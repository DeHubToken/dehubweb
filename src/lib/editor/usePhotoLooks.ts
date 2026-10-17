import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "@/hooks/use-draft-state";
import { createPhotoLookStore } from "./photoLooks";
import type { ClipEffects } from "./types";
const prefix = "dehub-photo-looks:v1:";
const store = createPhotoLookStore(key => typeof window === "undefined" ? null : window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key?.startsWith(prefix)) store.reload(event.key); });
export function usePhotoLooks() {
  const key = prefix + useAccountDraftKey("preferences");
  const looks = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, looks, create: (name: string, effects: ClipEffects) => store.create(key, name, effects), replace: (id: string, name: string, effects: ClipEffects) => store.replace(key, id, name, effects), remove: (id: string) => store.remove(key, id) };
}
