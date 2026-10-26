import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditorError } from "@/lib/editor/editorError";
import { editorErrorText } from "@/lib/editor/editorErrorText";
export function SvgSourceFileInput({ onLoad }: { onLoad: (source: string, name: string) => void }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [error, setError] = useState(""), request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const load = async (file?: File) => {
    if (!file) return; const token = ++request.current; setBusy(true);
    try { if (!file.size || file.size > 32768) throw new EditorError("copy.798e4647d7fd", "Choose an SVG file smaller than 32 KB"); const source = await file.text(); if (token !== request.current) return; onLoad(source, file.name.replace(/\.svg$/i, "").trim().slice(0, 100) || "Imported vector"); setError(""); }
    catch (reason) { if (token === request.current) setError(editorErrorText(reason, t("copy.469932e4deef", { defaultValue: "Could not read this SVG file" }))); }
    finally { if (token === request.current) setBusy(false); }
  };
  return <div className="space-y-1"><label className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-white/20 px-3 text-xs text-white/75 ${busy ? "opacity-35" : ""}`}>{t("editor.svgPath.chooseFile", { defaultValue: "Choose SVG file" })}<input type="file" accept=".svg,image/svg+xml" disabled={busy} className="sr-only" onChange={event => { void load(event.target.files?.[0]); event.target.value = ""; }} /></label>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
