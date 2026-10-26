import { designPrintDpi, dimensionDisplay, pixelsPerUnit } from "@/lib/editor/documentDimensions";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { applyDesignGuideGrid, designGuideGridPositions, getDesignGuides, type GuideGridOptions } from "@/lib/editor/designGuides";
import { editorErrorText } from "@/lib/editor/editorError";

export function GuideGridControls() {
  const { t } = useTranslation(), settings = useEditorStore(s => s.settings);
  const unit = getDesignGuides(settings.guides).unit, dpi = designPrintDpi(settings);
  const [options, setOptions] = useState<GuideGridOptions>({ columns: 3, rows: 3, margin: Math.round(Math.min(settings.width, settings.height) * 0.05), gutter: Math.round(Math.min(settings.width, settings.height) * 0.02), replace: true }), [message, setMessage] = useState("");
  const [unitDrafts, setUnitDrafts] = useState(() => ({ margin: dimensionDisplay(options.margin, unit, dpi), gutter: dimensionDisplay(options.gutter, unit, dpi) }));
  useEffect(() => { setUnitDrafts({ margin: dimensionDisplay(options.margin, unit, dpi), gutter: dimensionDisplay(options.gutter, unit, dpi) }); }, [unit, dpi]);
  let grid: { vertical: number[]; horizontal: number[] } | null = null, error = "";
  try { grid = designGuideGridPositions(settings.width, settings.height, options); } catch (value) { error = editorErrorText(value, t("copy.a3e13b9a4c21", { defaultValue: "Could not create this guide grid" })); }
  const apply = () => { try { const store = useEditorStore.getState(), before = store.toSnapshot(); store.applyDesignEdit(before, applyDesignGuideGrid(before, options)); setMessage(t("editor.guides.gridApplied", { defaultValue: "Guide grid applied" })); } catch (value) { setMessage(editorErrorText(value, t("copy.a3e13b9a4c21", { defaultValue: "Could not create this guide grid" }))); } };
  return <div className="space-y-3 border-t border-white/10 pt-3">
    <p className="text-xs font-medium text-white/75">{t("editor.guides.gridTitle", { defaultValue: "Layout grid" })}</p>
    <div className="flex flex-wrap items-center gap-3"><svg viewBox={`0 0 ${settings.width} ${settings.height}`} aria-label={t("editor.guides.gridPreview", { defaultValue: "Guide grid preview" })} className="h-20 w-28 shrink-0 rounded-lg border border-white/15 bg-white/5"><rect x="0" y="0" width={settings.width} height={settings.height} fill="#202020" />{grid?.vertical.map(x => <line key={`x${x}`} x1={x * settings.width} x2={x * settings.width} y1="0" y2={settings.height} stroke="#22d3ee" strokeWidth={Math.max(settings.width, settings.height) / 200} />)}{grid?.horizontal.map(y => <line key={`y${y}`} x1="0" x2={settings.width} y1={y * settings.height} y2={y * settings.height} stroke="#22d3ee" strokeWidth={Math.max(settings.width, settings.height) / 200} />)}</svg>
      {(["columns", "rows", "margin", "gutter"] as const).map(key => <label key={key} className="text-xs text-white/60"><span className="mb-1 block">{t(`editor.guides.grid.${key}`, { defaultValue: ({ columns: "Columns", rows: "Rows", margin: `Margin (${unit})`, gutter: `Gutter (${unit})` })[key] })}</span><input type="number" min={key === "columns" || key === "rows" ? 1 : 0} max={key === "columns" || key === "rows" ? 12 : Math.max(settings.width, settings.height) / pixelsPerUnit(unit, dpi)} step={key === "columns" || key === "rows" ? 1 : unit === "px" ? 1 : 0.001} value={key === "columns" || key === "rows" ? options[key] : unitDrafts[key]} onChange={event => { if (key === "margin" || key === "gutter") setUnitDrafts(previous => ({ ...previous, [key]: event.target.value })); setOptions({ ...options, [key]: key === "columns" || key === "rows" ? Number(event.target.value) : Number(event.target.value) * pixelsPerUnit(unit, dpi) }); setMessage(""); }} className="min-h-9 w-24 rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white" /></label>)}
    </div>
    <div className="flex flex-wrap items-center gap-3"><label className="flex min-h-9 items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={options.replace} onChange={event => setOptions({ ...options, replace: event.target.checked })} />{t("editor.guides.replaceExisting", { defaultValue: "Replace existing guides" })}</label><button type="button" disabled={!!error} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.guides.applyGrid", { defaultValue: "Apply grid" })}</button></div>
    {(error || message) && <p role="status" className="text-xs text-white/55">{error || message}</p>}
  </div>;
}
