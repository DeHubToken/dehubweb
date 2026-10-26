import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseReusableElementFile, reusableElementFile, type ReusableDesignElement } from "@/lib/editor/reusableElements";
import type { DesignClipboard } from "@/lib/editor/designClipboard";
import { exportFilename } from "@/lib/editor/exportName";
import { EditorError } from "@/lib/editor/editorError";
import { editorErrorText } from "@/lib/editor/editorErrorText";

export function ReusableElementFileControls({ element, onImport, disabled = false }: { element?: ReusableDesignElement; onImport?: (name: string, source: DesignClipboard) => void; disabled?: boolean }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(true), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const read = async (file?: File) => {
    if (!file || !onImport || disabled || working.current) return; working.current = true; setBusy(true); setError("");
    try {
      if (!/\.json$/i.test(file.name) || file.size > 800000) throw new EditorError("copy.48cdeedad049", "Choose a JSON element file smaller than 800 KB");
      const result = parseReusableElementFile(await file.text()); if (active.current) onImport(result.name, result.source);
    } catch (reason) { if (active.current) setError(editorErrorText(reason, t("copy.5e7c5ae44bce", { defaultValue: "Could not import this element" }))); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const download = () => {
    if (!element) return;
    try { const text = reusableElementFile(element.name, element.source), url = URL.createObjectURL(new Blob([text], { type: "application/json" })), link = document.createElement("a"); link.href = url; link.download = exportFilename(element.name + "-element", "json"); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError(""); }
    catch (reason) { setError(editorErrorText(reason, t("copy.70faf7e87d3d", { defaultValue: "Could not export this element" }))); }
  };
  return <div className="space-y-2">{element ? <button type="button" onClick={download} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.elements.downloadFile", { defaultValue: "Download element file" })}</button> : <label className={`inline-flex min-h-9 items-center rounded-lg border border-white/20 px-3 text-xs text-white/75 ${busy || disabled ? "opacity-35" : "cursor-pointer"}`}>{t("editor.elements.importFile", { defaultValue: "Import element file" })}<input type="file" disabled={busy || disabled} accept=".json,application/json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void read(file); }} /></label>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
