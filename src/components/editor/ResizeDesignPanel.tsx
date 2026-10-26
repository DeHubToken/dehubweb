import { useDocumentSize } from "@/lib/editor/useDocumentSize";
import { resizeComposition, RESIZE_ANCHORS, type ResizeContentMode } from "@/lib/editor/resizeComposition";
import { ResizeContentControls } from "./ResizeContentControls";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { DESIGN_UNITS, DOCUMENT_SIZE_PRESETS, dimensionDisplay, resizeDocument, type DesignUnit } from "@/lib/editor/documentDimensions";
import { editorErrorText } from "@/lib/editor/editorErrorText";

export function ResizeDesignPanel() {
  const { t } = useTranslation();
  const settings = useEditorStore(store => store.settings);
  const { unit, dpi, width, height, locked, pixels, valid, setDpi, change, changeUnit, toggleLock, swap } = useDocumentSize(settings);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ResizeContentMode>("relative"), [anchor, setAnchor] = useState("centre");
  const apply = (w: number, h: number, resolution: number) => { try { const store = useEditorStore.getState(), before = store.toSnapshot(); const resized = resizeDocument(before, w, h, resolution); store.applyDesignEdit(before, resizeComposition(before, resized, mode, RESIZE_ANCHORS.find(value => value.id === anchor) ?? RESIZE_ANCHORS[4], new Map(store.media.map(item => [item.id, { width: item.width ?? 0, height: item.height ?? 0 }])))); setError(""); } catch (value) { setError(editorErrorText(value, t("copy.2f4123dc9a35", { defaultValue: "Could not resize this design" }))); } };
  return <div className="space-y-3">
    <ResizeContentControls mode={mode} anchor={anchor} onMode={setMode} onAnchor={setAnchor} />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DOCUMENT_SIZE_PRESETS.map(size => <button key={size.id} type="button" onClick={() => apply(size.width, size.height, size.dpi)} className="rounded-lg border border-white/15 p-2 text-left text-xs hover:bg-white/10"><span className="block font-medium">{t(`editor.designTools.size.${size.id}`, { defaultValue: size.label })}</span><span className="text-white/45">{size.width} × {size.height} px</span></button>)}</div>
    <form onSubmit={event => { event.preventDefault(); if (valid) apply(pixels.width, pixels.height, Number(dpi)); }} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/65">{t("editor.resize.width", { defaultValue: "Width" })}<input type="number" required min={0.001} step="any" value={width} onChange={event => change("width", event.target.value)} className="ml-2 min-h-9 w-28 rounded-lg border border-white/20 bg-white/5 px-2 text-sm text-white" /></label><label className="text-xs text-white/65">{t("editor.resize.height", { defaultValue: "Height" })}<input type="number" required min={0.001} step="any" value={height} onChange={event => change("height", event.target.value)} className="ml-2 min-h-9 w-28 rounded-lg border border-white/20 bg-white/5 px-2 text-sm text-white" /></label><select value={unit} onChange={event => changeUnit(event.target.value as DesignUnit)} aria-label={t("editor.resize.units", { defaultValue: "Size units" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{DESIGN_UNITS.map(value => <option key={value} value={value}>{value}</option>)}</select><button type="button" aria-pressed={locked} onClick={toggleLock} className={`min-h-9 rounded-lg border px-3 text-xs ${locked ? "border-white bg-white/10" : "border-white/20"}`}>{t("editor.resize.lockAspect", { defaultValue: "Lock aspect ratio" })}</button><button type="button" onClick={swap} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs">{t("editor.resize.swap", { defaultValue: "Swap dimensions" })}</button></div>
      <label className="flex items-center gap-3 text-xs text-white/65">{t("editor.resize.dpi", { defaultValue: "Print resolution (pixels/inch)" })}<input type="number" required min={72} max={600} step={1} value={dpi} onChange={event => setDpi(event.target.value)} className="min-h-9 w-24 rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label>
      <p className="text-xs text-white/45">{valid ? `${pixels.width} × ${pixels.height} px · ${dimensionDisplay(pixels.width, "mm", Number(dpi))} × ${dimensionDisplay(pixels.height, "mm", Number(dpi))} mm` : t("editor.resize.range", { defaultValue: "Each side must resolve to 64–8,192 pixels. Print resolution must be 72–600." })}</p>
      <p className="text-xs text-white/45">{t("editor.resize.printHint", { defaultValue: "Print resolution sets the physical page size in PDF downloads. Existing measurements scale with the canvas." })}</p>
      <button type="submit" disabled={!valid} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.designTools.applySize", { defaultValue: "Apply size" })}</button>
    </form>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
