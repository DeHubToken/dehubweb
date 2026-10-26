import { useEffect, useRef, useState } from "react";
import { exportFilename } from "@/lib/editor/exportName";
import { editorErrorText } from "@/lib/editor/editorError";
import { translateCopy } from "@/i18n/copy";
export function TextArtworkDownload({ getContent, disabled = false, title, label, hint, suffix = "", extension, mime }: { getContent: (signal: AbortSignal) => string | Promise<string>; disabled?: boolean; title: string; label: string; hint: string; suffix?: string; extension: "svg" | "vcf" | "ics"; mime: string }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), controller = useRef<AbortController | null>(null), mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const download = async () => {
    if (disabled || working.current) return; working.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const content = await getContent(abort.signal); if (abort.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([content], { type: mime + ";charset=utf-8" })), anchor = document.createElement("a");
      try { anchor.href = url; anchor.download = exportFilename(title, extension, suffix, "design-artwork"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
      if (mounted.current) setError("");
    } catch (reason) { if (mounted.current && !abort.signal.aborted) setError(editorErrorText(reason, translateCopy("copy.127053546dd4", { defaultValue: "Could not download this file" }))); }
    finally { working.current = false; if (controller.current === abort) controller.current = null; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-1"><button type="button" disabled={disabled || busy} aria-busy={busy} onClick={() => { void download(); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{label}</button><p className="text-[10px] text-white/45">{hint}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
