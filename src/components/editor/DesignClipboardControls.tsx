import { useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { copyDesignSelection, cutDesignSelection, getDesignClipboard, getDesignClipboardSnapshot, pasteDesignSelection, reportDesignClipboard, subscribeDesignClipboard } from "@/lib/editor/designClipboard";
import { editorErrorText } from "@/lib/editor/editorError";

export function DesignClipboardControls() {
  const { t } = useTranslation();
  const ids = useEditorStore(store => store.selectedClipIds);
  const state = useSyncExternalStore(subscribeDesignClipboard, getDesignClipboardSnapshot, getDesignClipboardSnapshot);
  const feedback = state.feedback;
  const message = !feedback ? "" : feedback.kind === "error" ? feedback.message : t(`editor.clipboard.result.${feedback.kind}`, { defaultValue: ({ copied: "Copied {{count}} layers", pasted: "Pasted {{count}} layers", cut: "Cut {{count}} layers" })[feedback.kind], count: feedback.count }) + (feedback.kind === "pasted" && feedback.skipped ? ` · ${t("editor.clipboard.skipped", { defaultValue: "{{count}} did not fit this page", count: feedback.skipped })}` : "");
  const action = (paste: boolean) => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot();
      if (!paste) { if (!copyDesignSelection(before, store.selectedClipIds, store.currentTime)) reportDesignClipboard({ kind: "error", message: t("editor.clipboard.empty", { defaultValue: "Select unlocked foreground layers on this page" }) }); return; }
      const result = pasteDesignSelection(before, store.currentTime, state.clipboard, () => nanoid(10));
      if (result && store.applyDesignEdit(before, result.project)) { store.setIsPlaying(false); store.selectMany(result.ids); reportDesignClipboard({ kind: "pasted", count: result.ids.length, skipped: result.skipped }); }
    } catch (value) { reportDesignClipboard({ kind: "error", message: editorErrorText(value, t("copy.b3f1e2f7f110", { defaultValue: "Could not copy these layers" })) }); }
  };
  const button = "min-h-9 shrink-0 rounded-lg px-2.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35";
  const cut = () => {
    try { const store = useEditorStore.getState(), before = store.toSnapshot(), next = cutDesignSelection(before, store.selectedClipIds, store.currentTime, () => nanoid(10)); if (next !== before && store.applyDesignEdit(before, next)) { store.selectClip(null); reportDesignClipboard({ kind: "cut", count: getDesignClipboard()?.layers.length ?? 0 }); } }
    catch (value) { reportDesignClipboard({ kind: "error", message: editorErrorText(value, t("copy.60183677d43b", { defaultValue: "Could not cut these layers" })) }); }
  };
  return <div className="flex shrink-0 items-center gap-1"><button type="button" disabled={!ids.length} onClick={() => action(false)} className={button}>{t("editor.clipboard.copy", { defaultValue: "Copy layers" })}</button><button type="button" disabled={!ids.length} onClick={cut} className={button}>{t("editor.clipboard.cut", { defaultValue: "Cut layers" })}</button><button type="button" disabled={!state.clipboard} onClick={() => action(true)} className={button}>{t("editor.clipboard.paste", { defaultValue: "Paste layers" })}</button>{message && <span role={feedback?.kind === "error" ? "alert" : "status"} title={message} className={`max-w-40 truncate text-[10px] ${feedback?.kind === "error" ? "text-red-300" : "text-white/45"}`}>{message}</span>}</div>;
}
