import { useState } from "react";
import { exportFilename } from "@/lib/editor/exportName";
export function SvgArtworkDownload({ getSvg, disabled = false, title, label, hint, suffix = "" }: { getSvg: () => string; disabled?: boolean; title: string; label: string; hint: string; suffix?: string }) {
  const [error, setError] = useState("");
  const download = () => { if (disabled) return; try { const url = URL.createObjectURL(new Blob([getSvg()], { type: "image/svg+xml;charset=utf-8" })), anchor = document.createElement("a"); try { anchor.href = url; anchor.download = exportFilename(title, "svg", suffix, "vector-artwork"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); } setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not download vector artwork"); } };
  return <div className="space-y-1"><button type="button" disabled={disabled} onClick={download} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{label}</button><p className="text-[10px] text-white/45">{hint}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
