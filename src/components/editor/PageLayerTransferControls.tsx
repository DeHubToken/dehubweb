import { useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { parsePageSelection } from "@/lib/editor/pageExports";
import { getPages } from "@/lib/editor/pages";
import { transferDesignSelection } from "@/lib/editor/pageLayerTransfer";

export function PageLayerTransferControls() {
  const { t } = useTranslation(), ids = useEditorStore(store => store.selectedClipIds);
  const [open, setOpen] = useState(false), [range, setRange] = useState(""), [error, setError] = useState(""), [status, setStatus] = useState("");
  const apply = (move: boolean) => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot(), targets = parsePageSelection(range.replace(/[–—]/g, "-"), getPages(before.settings, before.clips).length);
      const result = transferDesignSelection(before, store.selectedClipIds, store.currentTime, targets, move, () => nanoid(10));
      if (!store.applyDesignEdit(before, result.project)) return;
      store.setIsPlaying(false); if (move) store.selectClip(null);
      setStatus(t(move ? "editor.pages.layersMoved" : "editor.pages.layersCopied", { defaultValue: move ? "Moved {{count}} layers to page {{page}}" : "Copied {{count}} layers across {{pages}} pages", count: result.count, page: targets[0] + 1, pages: result.pages })); setError("");
    } catch (reason) { setStatus(""); setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-2 rounded-lg border border-white/15 p-3"><button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-9 text-xs font-medium text-white/80">{t("editor.pages.transferLayers", { defaultValue: "Move or copy selected layers to pages" })}</button>{open && <><input value={range} onChange={event => { setRange(event.target.value); setStatus(""); setError(""); }} maxLength={2000} placeholder="2, 4-6" aria-label={t("editor.pages.layerDestinations", { defaultValue: "Destination page numbers or ranges" })} className="min-h-9 w-full rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white" /><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!ids.length || !range.trim()} onClick={() => apply(false)}>{t("editor.pages.copyLayersToPages", { defaultValue: "Copy to pages" })}</button><button type="button" className={button} disabled={!ids.length || !range.trim()} onClick={() => apply(true)}>{t("editor.pages.moveLayersToPage", { defaultValue: "Move to page" })}</button></div><p className="text-xs text-white/45">{t("editor.pages.transferHint", { defaultValue: "Copy to up to 50 pages, or move to one. Groups and placement follow the selection. Moving affects this page only; other appearances are kept. The destination must fit timed layers." })}</p></>}{status && <p role="status" className="text-xs text-cyan-200">{status}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
