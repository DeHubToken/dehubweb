import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { brandStylesFile, parseBrandStylesFile, type BrandStylesFile } from "@/lib/editor/brandStylesFile";
import { exportFilename } from "@/lib/editor/exportName";
import type { BrandStyles } from "@/lib/editor/brandStyles";
import { EditorError } from "@/lib/editor/editorError";
import { editorErrorText } from "@/lib/editor/editorErrorText";

export function BrandStylesFileControls({ value, name, onImport }: { value: BrandStyles; name: string; onImport: (file: BrandStylesFile) => void }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const active = useRef(true), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const read = async (file?: File) => {
    if (!file || working.current) return; working.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (!/\.json$/i.test(file.name) || file.size > 32768) throw new EditorError("copy.0c400a307803", "Choose a JSON brand styles file smaller than 32 KB");
      const result = parseBrandStylesFile(await file.text()); if (!active.current) return;
      onImport(result); setMessage(t("editor.brand.fileLoaded", { defaultValue: "Imported colours and fonts. Save them as a named style or apply them to this design." }));
    } catch (reason) { if (active.current) setError(editorErrorText(reason, t("copy.63d75acdb277", { defaultValue: "Could not import brand styles" }))); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const download = () => {
    try {
      const text = brandStylesFile(name, value), url = URL.createObjectURL(new Blob([text], { type: "application/json" })), link = document.createElement("a");
      link.href = url; link.download = exportFilename(name || "Brand styles", "json"); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError(""); setMessage(t("editor.brand.fileDownloaded", { defaultValue: "Brand styles file downloaded" }));
    } catch (reason) { setMessage(""); setError(editorErrorText(reason, t("copy.8c017220c757", { defaultValue: "Could not export brand styles" }))); }
  };
  const filled = value.colors.length > 0 || !!value.headingFont || !!value.bodyFont;
  return <div className="space-y-2"><div className="flex flex-wrap gap-2"><label className={`inline-flex min-h-9 items-center rounded-lg border border-white/20 px-3 text-xs text-white/75 ${busy ? "opacity-35" : "cursor-pointer"}`}>{t("editor.brand.importFile", { defaultValue: "Import styles file" })}<input type="file" disabled={busy} accept=".json,application/json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void read(file); }} /></label><button type="button" disabled={busy || !filled} onClick={download} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.brand.exportFile", { defaultValue: "Download styles file" })}</button></div><p className="text-[10px] text-white/45">{t("editor.brand.fileHint", { defaultValue: "Transfer named colours and font pairs between devices. Images and logos stay in the design." })}</p>{message && <p role="status" className="text-xs text-white/60">{message}</p>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
