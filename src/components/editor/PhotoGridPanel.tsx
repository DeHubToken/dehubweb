import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { insertPhotoGrid, PHOTO_GRIDS, type PhotoGridId } from "@/lib/editor/photoGrids";

export function PhotoGridPanel() {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<PhotoGridId>("four");
  const [gap, setGap] = useState(16);
  return <div className="space-y-3">
    <p className="text-xs text-white/60">{t("editor.grids.hint", { defaultValue: "Insert a photo layout, then drop pictures onto its frames. Double-click a frame to edit it inside the group." })}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PHOTO_GRIDS.map(preset => <button key={preset.id} type="button" aria-pressed={grid === preset.id} onClick={() => setGrid(preset.id)} className={`flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left text-xs ${grid === preset.id ? "border-white bg-white/10" : "border-white/15 hover:bg-white/5"}`}>
      <span className="grid h-12 w-16 shrink-0 gap-0.5" style={{ gridTemplateColumns: `repeat(${preset.columns}, 1fr)`, gridTemplateRows: `repeat(${preset.rows}, 1fr)` }}>{preset.cells.map(([column, row, columns, rows], index) => <span key={index} className="rounded-sm bg-slate-400" style={{ gridColumn: `${column + 1} / span ${columns}`, gridRow: `${row + 1} / span ${rows}` }} />)}</span>
      <span>{t(`editor.grids.layout.${preset.id}`, { defaultValue: preset.label })}</span>
    </button>)}</div>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2 text-white/65">{t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })}<input type="number" min={0} max={100} value={gap} onChange={e => setGap(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="min-h-9 w-20 rounded-lg border border-white/20 bg-white/5 px-2 text-white" /></label>
      <button type="button" onClick={() => { const s = useEditorStore.getState(), before = s.toSnapshot(); const result = insertPhotoGrid(before, s.currentTime, grid, gap, () => nanoid(10)); if (result && s.applyDesignEdit(before, result.project)) s.selectMany(result.ids); }} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black">{t("editor.grids.insert", { defaultValue: "Insert photo grid" })}</button>
    </div>
  </div>;
}
