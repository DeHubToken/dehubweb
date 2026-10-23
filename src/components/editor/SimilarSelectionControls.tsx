import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { designSelectionKey, similarDesignSelection, type SimilarSelectionKind } from "@/lib/editor/similarSelection";

export function SimilarSelectionControls() {
  const { t } = useTranslation(), ids = useEditorStore(store => store.selectedClipIds), clips = useEditorStore(store => store.clips);
  const reference = clips.find(clip => clip.id === ids[0]);
  const choose = (kind: SimilarSelectionKind | "all") => { const store = useEditorStore.getState(); store.setIsPlaying(false); store.selectMany(similarDesignSelection(store.toSnapshot(), store.selectedClipIds[0] ?? null, store.currentTime, kind)); };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><button type="button" className={button} onClick={() => choose("all")}>{t("editor.selection.allPage", { defaultValue: "Select all on page" })}</button>{(["type", "colour", "font"] as const).map(kind => <button key={kind} type="button" className={button} disabled={!reference || designSelectionKey(reference, kind) === null} onClick={() => choose(kind)}>{t(`editor.selection.same.${kind}`, { defaultValue: ({ type: "Select same type", colour: "Select same colour", font: "Select same font" })[kind] })}</button>)}<button type="button" className={button} disabled={!ids.length} onClick={() => useEditorStore.getState().selectClip(null)}>{t("editor.selection.clear", { defaultValue: "Clear selection" })}</button><span className="text-xs text-white/45">{t("editor.selection.count", { defaultValue: "{{count}} selected", count: ids.length })}</span></div><p className="text-xs text-white/45">{t("editor.selection.sameHint", { defaultValue: "Match the first selected layer on this page. Groups stay together; hidden layers, backgrounds, and locked groups are skipped." })}</p></div>;
}
