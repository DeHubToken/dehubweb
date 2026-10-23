import { useTranslation } from "react-i18next";

export function GraphicDraftHistoryControls({ undo, redo, canUndo, canRedo }: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) {
  const { t } = useTranslation();
  return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2"><span className="mr-auto text-[10px] text-white/45">{t("editor.graphicDraftHistory.local", { defaultValue: "Graphic draft" })}</span>{[{ label: t("editor.graphicDraftHistory.undo", { defaultValue: "Undo draft change" }), action: undo, enabled: canUndo }, { label: t("editor.graphicDraftHistory.redo", { defaultValue: "Redo draft change" }), action: redo, enabled: canRedo }].map(item => <button key={item.label} type="button" disabled={!item.enabled} onClick={item.action} className="min-h-9 rounded-md border border-white/20 px-2 text-xs text-white/70 disabled:opacity-35">{item.label}</button>)}</div>;
}
