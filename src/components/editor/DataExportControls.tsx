import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataVisualExport } from "@/lib/editor/dataVisualExport";
import { exportFilename } from "@/lib/editor/exportName";
import { EditorError, editorErrorText } from "@/lib/editor/editorError";
export function DataExportControls({ source, mode, multiple, title }: { source: string; mode: "chart" | "table"; multiple: boolean; title: string }) {
  const { t } = useTranslation(), [formulasAsText, setFormulasAsText] = useState(true), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const action = async (copy: boolean) => {
    if (working.current) return; working.current = true; setBusy(true);
    try {
      const data = dataVisualExport(source, mode, multiple, copy ? "\t" : ",", formulasAsText);
      if (copy) {
        if (!navigator.clipboard?.writeText) throw new EditorError("copy.1441d78ed252", "Copy is unavailable in this browser. Download CSV instead");
        await navigator.clipboard.writeText(data);
      } else {
        const blob = new Blob(["\uFEFF", data], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), anchor = document.createElement("a");
        try { anchor.href = url; anchor.download = exportFilename(title, "csv", "-data", "data"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
      }
      if (mounted.current) { setError(""); setMessage(t(copy ? "editor.dataExport.copied" : "editor.dataExport.downloaded", { defaultValue: copy ? "Cells copied" : "CSV downloaded" })); }
    } catch (reason) { if (mounted.current) { setMessage(""); setError(editorErrorText(reason, t("copy.62ed2a757980", { defaultValue: "Could not export this data" }))); } }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-2 rounded-lg border border-white/10 p-3"><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !source.trim()} onClick={() => { void action(false); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.dataExport.csv", { defaultValue: "Download CSV" })}</button><button type="button" disabled={busy || !source.trim()} onClick={() => { void action(true); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.dataExport.copyCells", { defaultValue: "Copy cells" })}</button></div><label className="flex min-h-9 items-center gap-2 text-xs text-white/55"><input type="checkbox" checked={formulasAsText} onChange={event => setFormulasAsText(event.target.checked)} />{t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })}</label>{message && <p role="status" className="text-xs text-white/60">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
