import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "@/hooks/use-draft-state";
import { createReusableElementStore } from "./reusableElements";
import type { DesignClipboard } from "./designClipboard";
const prefix = "dehub-reusable-elements:v1:";
const store = createReusableElementStore(key => typeof window === "undefined" ? null : window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key?.startsWith(prefix)) store.reload(event.key); });
export function useReusableElements() {
  const key = prefix + useAccountDraftKey("preferences"), items = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, items, create: (name: string, source: DesignClipboard) => store.create(key, name, source), remove: (id: string) => store.remove(key, id) };
}
