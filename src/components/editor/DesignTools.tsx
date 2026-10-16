import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Paintbrush, Palette, Scaling, Search, ChartColumn, Blend } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import type { ProjectSnapshot } from "@/lib/editor/types";
import { applyDesignPalette, applyDesignStyle, copyDesignStyle, designColours, DESIGN_PALETTES, DESIGN_SIZES, replaceDesignColour, resizeDesign, type DesignStyle } from "@/lib/editor/designTools";
import { DesignTextSearch } from "./DesignTextSearch";
import { DataVisualPanel } from "./DataVisualPanel";
import { FillPanel } from "./FillPanel";

/** Contextual design actions stay within reach while the canvas remains visible. */
export function DesignTools() {
  const { t } = useTranslation();
  const clips = useEditorStore(s => s.clips);
  const ids = useEditorStore(s => s.selectedClipIds);
  const settings = useEditorStore(s => s.settings);
  const projectId = useEditorStore(s => s.projectId);
  const [clipboard, setClipboard] = useState<{ projectId: string; style: DesignStyle } | null>(null);
  const [panel, setPanel] = useState<"colours" | "resize" | "search" | "data" | "fill" | null>(null);
  const [width, setWidth] = useState(String(settings.width));
  const [height, setHeight] = useState(String(settings.height));
  const [colour, setColour] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("#ffffff");
  const style = clipboard?.projectId === projectId ? clipboard.style : null;
  const selected = clips.filter(c => ids.includes(c.id) && c.kind !== "audio");
  const copy = () => {
    if (selected.length !== 1) return;
    const value = copyDesignStyle(selected[0]);
    if (value) setClipboard({ projectId, style: value });
  };
  const apply = (operation: (project: ProjectSnapshot) => ProjectSnapshot) => {
    const store = useEditorStore.getState();
    const before = store.toSnapshot(), next = operation(before);
    if (next === before) return;
    store.applyDesignEdit(before, next);
  };
  const button = "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";
  return <div className="relative z-10 shrink-0 border-b border-white/10 bg-neutral-950/95">
    <div role="toolbar" aria-label={t("editor.designTools.toolbar", { defaultValue: "Design tools" })} className="flex min-h-11 items-center gap-1 overflow-x-auto px-2">
      <button type="button" className={button} aria-expanded={panel === "resize"} onClick={() => { setWidth(String(settings.width)); setHeight(String(settings.height)); setPanel(panel === "resize" ? null : "resize"); }}><Scaling size={15} />{t("editor.designTools.resize", { defaultValue: "Resize" })}<span className="hidden text-white/40 xl:inline">{settings.width} × {settings.height}</span></button>
      <button type="button" className={button} aria-expanded={panel === "colours"} onClick={() => setPanel(panel === "colours" ? null : "colours")}><Palette size={15} />{t("editor.designTools.colours", { defaultValue: "Document colours" })}</button>
      <span className="mx-1 h-4 w-px shrink-0 bg-white/15" />
      <button type="button" className={button} disabled={selected.length !== 1} onClick={copy}><Copy size={15} />{t("editor.designTools.copyStyle", { defaultValue: "Copy style" })}</button>
      <button type="button" className={button} disabled={!style || !selected.some(c => !c.locked)} onClick={() => style && apply(p => applyDesignStyle(p, ids, style))}><Paintbrush size={15} />{t("editor.designTools.pasteStyle", { defaultValue: "Paste style" })}</button>
      <button type="button" className={button} aria-expanded={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}><Search size={15} />{t("editor.designTools.findReplace", { defaultValue: "Find and replace" })}</button>
      <button type="button" className={button} aria-expanded={panel === "data"} onClick={() => setPanel(panel === "data" ? null : "data")}><ChartColumn size={15} />{t("editor.dataVisual.title", { defaultValue: "Charts and tables" })}</button>
      <button type="button" className={button} aria-expanded={panel === "fill"} onClick={() => setPanel(panel === "fill" ? null : "fill")}><Blend size={15} />{t("editor.fills.title", { defaultValue: "Gradient fills" })}</button>
      {style && <span role="status" className="whitespace-nowrap px-2 text-[11px] text-white/45">{t("editor.designTools.styleReady", { defaultValue: "Style ready to apply" })}</span>}
      {selected.length > 1 && <button type="button" className={button} onClick={() => useEditorStore.getState().groupSelected()}>{t("editor.groups.group", { defaultValue: "Group" })}</button>}
      {selected.some(c => c.groupId) && <button type="button" className={button} onClick={() => useEditorStore.getState().ungroupSelected()}>{t("editor.groups.ungroup", { defaultValue: "Ungroup" })}</button>}
    </div>
    {panel && <section aria-label={t(`editor.designTools.${panel}`, { defaultValue: panel === "resize" ? "Resize" : panel === "search" ? "Find and replace" : "Document colours" })} className="max-h-64 overflow-y-auto border-t border-white/10 p-3">
      {panel === "fill" ? <FillPanel /> : panel === "data" ? <DataVisualPanel /> : panel === "search" ? <DesignTextSearch project={useEditorStore.getState().toSnapshot()} apply={apply} seek={(id, time) => { const s = useEditorStore.getState(); s.setIsPlaying(false); s.setCurrentTime(time + 0.01); s.selectClip(id); }} /> : panel === "resize" ? <div className="space-y-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESIGN_SIZES.map(size => <button key={size.id} type="button" onClick={() => { apply(p => resizeDesign(p, size.width, size.height)); setPanel(null); }} className="rounded-lg border border-white/15 p-2 text-left text-xs hover:bg-white/10">
          <span className="block font-medium">{t(`editor.designTools.size.${size.id}`, { defaultValue: size.label })}</span><span className="text-white/45">{size.width} × {size.height}</span>
        </button>)}
      </div><form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); apply(p => resizeDesign(p, Number(width), Number(height))); }}>
        <input type="number" min={64} max={8192} required value={width} onChange={e => setWidth(e.target.value)} aria-label={t("editor.designTools.width", { defaultValue: "Width in pixels" })} className="min-h-9 w-24 rounded-lg border border-white/20 bg-white/5 px-2 text-sm" />
        <span className="text-white/40">×</span><input type="number" min={64} max={8192} required value={height} onChange={e => setHeight(e.target.value)} aria-label={t("editor.designTools.height", { defaultValue: "Height in pixels" })} className="min-h-9 w-24 rounded-lg border border-white/20 bg-white/5 px-2 text-sm" />
        <button type="submit" className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black">{t("editor.designTools.applySize", { defaultValue: "Apply size" })}</button>
      </form></div> : <div className="space-y-3">
        <p className="text-xs text-white/55">{t("editor.designTools.colourHint", { defaultValue: "Choose a colour to replace across this design. Locked layers are preserved." })}</p>
        <div className="flex flex-wrap gap-2">{designColours(useEditorStore.getState().toSnapshot()).map(value => <button key={value} type="button" aria-label={value} aria-pressed={colour === value} onClick={() => { setColour(value); setReplacement(value); }} className={`h-8 w-8 rounded-full border-2 ${colour === value ? "border-white ring-2 ring-sky-400" : "border-white/25"}`} style={{ background: value }} />)}</div>
        {colour && <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-white/65">{colour} →</span>
          <input type="color" value={replacement} onChange={e => setReplacement(e.target.value)} aria-label={t("editor.designTools.replacement", { defaultValue: "Replacement colour" })} className="h-8 w-12 cursor-pointer rounded bg-transparent" />
          <button type="button" disabled={colour === replacement} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40" onClick={() => { apply(p => replaceDesignColour(p, colour, replacement)); setColour(replacement); }}>{t("editor.designTools.changeAll", { defaultValue: "Change all" })}</button>
        </div>}
        <div className="flex flex-wrap gap-2">{DESIGN_PALETTES.map(palette => <button type="button" key={palette.id} onClick={() => apply(p => applyDesignPalette(p, palette.colours))} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs hover:bg-white/10">
          <span className="flex overflow-hidden rounded">{palette.colours.map(value => <span key={value} className="h-5 w-4" style={{ background: value }} />)}</span>{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}
        </button>)}</div>
      </div>}
    </section>}
  </div>;
}
