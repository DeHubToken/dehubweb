import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { extractDesignPagePalette } from "@/lib/editor/extractDesignPagePalette";
import { applyDesignPalette } from "@/lib/editor/designTools";

export function PagePaletteControls({ onPick, canPick }: { canPick: boolean; onPick: (colour: string) => void }) {
  const { t } = useTranslation(), projectId = useEditorStore(store => store.projectId), time = useEditorStore(store => store.currentTime);
  const [colours, setColours] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { pending.current?.abort(); pending.current = null; setColours([]); setBusy(false); setError(""); return () => { pending.current?.abort(); pending.current = null; }; }, [projectId, time]);
  const extract = async () => {
    pending.current?.abort(); const request = new AbortController(); pending.current = request;
    const store = useEditorStore.getState(), snapshot = store.toSnapshot(), at = store.currentTime; store.setIsPlaying(false); setBusy(true); setError("");
    try { const result = await extractDesignPagePalette(snapshot, at, request.signal); if (!request.signal.aborted && pending.current === request && useEditorStore.getState().projectId === snapshot.id) setColours(result); }
    catch (reason) { if (!request.signal.aborted && pending.current === request) setError(reason instanceof Error ? reason.message : "Could not extract page colours"); }
    finally { if (pending.current === request) { pending.current = null; setBusy(false); } }
  };
  return <div className="space-y-2 rounded-lg border border-white/15 p-3"><button type="button" disabled={busy} onClick={extract} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t(busy ? "editor.palette.extracting" : "editor.palette.extractPage", { defaultValue: busy ? "Extracting colours…" : "Extract current page colours" })}</button>{!!colours.length && <><div className="flex flex-wrap gap-2">{colours.map(colour => <button type="button" disabled={!canPick} key={colour} aria-label={t("editor.palette.useColour", { defaultValue: "Use {{colour}}", colour })} onClick={() => onPick(colour)} className="space-y-1 rounded-lg border border-white/20 p-1 text-[10px] text-white/65 disabled:cursor-default"><span className="block h-8 w-12 rounded" style={{ background: colour }} /><span>{colour}</span></button>)}</div><button type="button" onClick={() => { const store = useEditorStore.getState(), before = store.toSnapshot(); if (before.id === projectId) store.applyDesignEdit(before, applyDesignPalette(before, colours)); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.palette.applyDesign", { defaultValue: "Apply palette to design" })}</button></>}<p className="text-xs text-white/45">{!canPick && t("editor.palette.chooseTarget", { defaultValue: "Choose a document colour first to use a swatch as its replacement. " })}{t("editor.palette.extractionHint", { defaultValue: "Samples the current page, including photos. Choose a swatch as the replacement colour, or apply the palette to editable colours throughout the design." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
