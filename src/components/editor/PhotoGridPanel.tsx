import { MockupFrameControls } from "./MockupFrameControls";
import { useState } from "react";
import { PhotoArrangementPanel } from "./PhotoArrangementPanel";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { insertPhotoGrid, PHOTO_GRIDS, type PhotoGridId } from "@/lib/editor/photoGrids";
import { MEDIA_FRAMES, MEDIA_FRAME_NAMES, mediaFramePreview, type MediaFrame } from "@/lib/editor/mediaFrames";

export function PhotoGridPanel() {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<PhotoGridId>("four");
  const [gap, setGap] = useState(16);
  const [frame, setFrame] = useState<MediaFrame>("rect"), [radius, setRadius] = useState(0);
  return <div className="space-y-3">
    <PhotoArrangementPanel />
    <MockupFrameControls />
    <p className="text-xs text-white/60">{t("editor.grids.hint", { defaultValue: "Insert a photo layout, then drop pictures onto its frames. Double-click a frame to edit it inside the group." })}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PHOTO_GRIDS.map(preset => <button key={preset.id} type="button" aria-pressed={grid === preset.id} onClick={() => setGrid(preset.id)} className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left text-xs ${grid === preset.id ? "border-white bg-white/10" : "border-white/15 hover:bg-white/5"}`}>
      <span className="grid h-12 w-16 shrink-0 gap-0.5" style={{ gridTemplateColumns: `repeat(${preset.columns}, 1fr)`, gridTemplateRows: `repeat(${preset.rows}, 1fr)` }}>{preset.cells.map(([column, row, columns, rows], index) => <svg key={index} aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full fill-slate-400" style={{ gridColumn: `${column + 1} / span ${columns}`, gridRow: `${row + 1} / span ${rows}` }}><path d={mediaFramePreview(frame)} /></svg>)}</span>
      <span>{t(`editor.grids.layout.${preset.id}`, { defaultValue: preset.label })}</span>
    </button>)}</div>
    <div className="flex flex-wrap gap-2">{MEDIA_FRAMES.map(value => <button key={value} type="button" aria-pressed={frame === value} onClick={() => setFrame(value)} className={`flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs ${frame === value ? "border-white bg-white/10" : "border-white/15"}`}><svg aria-hidden viewBox="0 0 100 100" className="h-5 w-5 fill-white/70"><path d={mediaFramePreview(value)} /></svg>{t(`editor.frames.${value}`, { defaultValue: MEDIA_FRAME_NAMES[value] })}</button>)}</div>
    {frame === "rect" && <label className="flex items-center gap-3 text-xs text-white/60">{t("editor.grids.rounding", { defaultValue: "Corner rounding" })}<input type="range" min={0} max={200} step={1} value={radius} onChange={event => setRadius(Number(event.target.value))} />{radius}</label>}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2 text-white/65">{t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })}<input type="number" min={0} max={100} value={gap} onChange={e => setGap(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label>
      <button type="button" onClick={() => { const s = useEditorStore.getState(), before = s.toSnapshot(); const result = insertPhotoGrid(before, s.currentTime, grid, gap, () => nanoid(10), { frame, radius: frame === "rect" ? radius : 0 }); if (result && s.applyDesignEdit(before, result.project)) s.selectMany(result.ids); }} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black">{t("editor.grids.insert", { defaultValue: "Insert photo grid" })}</button>
    </div>
  </div>;
}
