import { useEffect, useRef, useState } from "react";
import { exportFilename } from "@/lib/editor/exportName";
export function SvgArtworkDownload({ getSvg, disabled = false, title, label, hint, suffix = "" }: { getSvg: (signal: AbortSignal) => string | Promise<string>; disabled?: boolean; title: string; label: string; hint: string; suffix?: string }) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), controller = useRef<AbortController | null>(null), mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const download = async () => {
    if (disabled || working.current) return; working.current = true; setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const svg = await getSvg(abort.signal); if (abort.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" })), anchor = document.createElement("a");
      try { anchor.href = url; anchor.download = exportFilename(title, "svg", suffix, "vector-artwork"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
      if (mounted.current) setError("");
    } catch (reason) { if (mounted.current && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not download vector artwork"); }
    finally { working.current = false; if (controller.current === abort) controller.current = null; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-1"><button type="button" disabled={disabled || busy} aria-busy={busy} onClick={() => { void download(); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{label}</button><p className="text-[10px] text-white/45">{hint}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
