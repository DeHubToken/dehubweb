import { useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { applyBackgroundToAllPages } from "@/lib/editor/pageBackgrounds";
import { getPages } from "@/lib/editor/pages";

export function BackgroundScopeControls() {
  const { t } = useTranslation();
  const clips = useEditorStore(store => store.clips), settings = useEditorStore(store => store.settings);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const count = getPages(settings, clips).length;
  return <div className="space-y-2 border-t border-white/10 pt-3"><button type="button" disabled={count < 2} onClick={() => {
    try { const store = useEditorStore.getState(), before = store.toSnapshot(), result = applyBackgroundToAllPages(before, store.currentTime, () => nanoid(10)); if (result.project !== before && store.applyDesignEdit(before, result.project) && result.id) store.selectClip(result.id); setError(""); setMessage(t("editor.backgrounds.updated", { defaultValue: "Updated {{count}} pages", count: result.count }) + (result.skipped ? ` · ${t("editor.backgrounds.skipped", { defaultValue: "{{count}} locked pages preserved", count: result.skipped })}` : "")); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not apply this background"); }
  }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/80 disabled:opacity-35">{t("editor.backgrounds.applyAll", { defaultValue: "Copy page background to all pages" })}</button><p className="text-xs text-white/45">{t("editor.backgrounds.hint", { defaultValue: "Copies this page’s photo, gradient, or solid background. Locked backgrounds stay unchanged." })}</p>{message && <p role="status" className="text-xs text-white/60">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
