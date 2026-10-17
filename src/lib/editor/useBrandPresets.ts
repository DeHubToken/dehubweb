import { useCallback, useSyncExternalStore } from "react";
import { useAccountDraftKey } from "@/hooks/use-draft-state";
import { createBrandPresetStore } from "./brandPresets";
import type { BrandStyles } from "./brandStyles";
const prefix = "dehub-brand-presets:v1:";
const store = createBrandPresetStore(key => typeof window === "undefined" ? null : window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value));
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key?.startsWith(prefix)) store.reload(event.key); });
export function useBrandPresets() {
  const key = prefix + useAccountDraftKey("preferences");
  const presets = useSyncExternalStore(store.subscribe, useCallback(() => store.get(key), [key]), () => store.empty);
  return { scope: key, presets, create: (name: string, styles: BrandStyles) => store.create(key, name, styles), replace: (id: string, styles: BrandStyles) => store.replace(key, id, styles), remove: (id: string) => store.remove(key, id) };
}
