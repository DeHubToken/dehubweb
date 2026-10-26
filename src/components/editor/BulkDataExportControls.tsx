import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bulkDataExport, type BulkDataExportScope } from "@/lib/editor/bulkDataExport";
import type { BulkRowFilter } from "@/lib/editor/bulkRowFilter";
import { exportFilename } from "@/lib/editor/exportName";
import { EditorError, editorErrorText } from "@/lib/editor/editorError";
export function BulkDataExportControls({ source, first, last, filter, title, count }: { source: string; first: number; last: number; filter: BulkRowFilter; title: string; count: number }) {
  const { t } = useTranslation(), [formulas, setFormulas] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), working = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const action = async (scope: BulkDataExportScope, copy = false) => {
    if (working.current) return; working.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const content = bulkDataExport(source, scope, first, last, filter, copy ? "\t" : ",", formulas);
      if (copy) { if (!navigator.clipboard?.writeText) throw new EditorError("copy.7da61973e0f4", "Clipboard access is unavailable in this browser"); await navigator.clipboard.writeText(content); }
      else { const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a"); try { anchor.href = url; anchor.download = exportFilename(title, "csv", scope === "headers" ? "-bulk-template" : scope === "batch" ? "-batch-data" : "-bulk-data", "data"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); } }
      if (mounted.current) { setError(""); setMessage(t(copy ? "editor.bulk.cellsCopied" : "editor.bulk.csvDownloaded", { defaultValue: copy ? "Batch cells copied" : "CSV downloaded" })); }
    } catch (reason) { if (mounted.current) setError(editorErrorText(reason, t("copy.0a2b6fc15104", { defaultValue: "Could not export spreadsheet data" }))); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  return <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-xs font-medium text-white/75">{t("editor.bulk.exportData", { defaultValue: "Export spreadsheet data" })}</summary><div className="mt-3 space-y-2"><div className="flex flex-wrap gap-2">{(["all", "batch", "headers"] as const).map(scope => <button type="button" key={scope} disabled={busy || scope === "batch" && !count} onClick={() => { void action(scope); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/65 disabled:opacity-35">{t(`editor.bulk.csvScope.${scope}`, { defaultValue: ({ all: "All records CSV", batch: "Batch records CSV", headers: "Header template CSV" })[scope] })}</button>)}<button type="button" disabled={busy || !count} onClick={() => { void action("batch", true); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/65 disabled:opacity-35">{t("editor.bulk.copyBatch", { defaultValue: "Copy batch cells" })}</button></div><label className="flex items-center gap-2 text-xs text-white/55"><input type="checkbox" checked={formulas} onChange={event => setFormulas(event.target.checked)} />{t("editor.dataExport.formulasAsText", { defaultValue: "Treat formulas as text" })}</label>{message && <p role="status" className="text-xs text-cyan-200">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div></details>;
}
