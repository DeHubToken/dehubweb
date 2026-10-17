import { useTranslation } from "react-i18next";
import type { ChartData } from "@/lib/editor/dataVisuals";
import { CHART_POINT_SHAPES, CHART_LINE_PATTERNS } from "@/lib/editor/chartMarks";
type MarkStyle = Pick<ChartData, "pointShape" | "linePattern" | "seriesPatterns" | "scatterLines">;
export function ChartMarkerControls({ value, kind, multiple, onChange }: { value: MarkStyle; kind: ChartData["kind"]; multiple: boolean; onChange: (value: MarkStyle) => void }) {
  const { t } = useTranslation();
  if (!["line", "area", "scatter", "dot", "lollipop", "radar"].includes(kind)) return null;
  const lines = kind !== "dot" && (kind !== "scatter" || value.scatterLines);
  return <div className="space-y-2 border-t border-white/10 pt-3">
    {kind !== "radar" && <label className="block space-y-1 text-xs text-white/65"><span>{t("editor.charts.pointShape", { defaultValue: "Point shape" })}</span><select disabled={multiple && !!value.seriesPatterns} value={value.pointShape ?? "circle"} onChange={event => onChange({ ...value, pointShape: event.target.value as ChartData["pointShape"] })} className="min-h-9 w-full rounded-lg border border-white/20 bg-neutral-900 px-3 disabled:opacity-35">{CHART_POINT_SHAPES.map(shape => <option key={shape} value={shape}>{t(`editor.charts.pointShape.${shape}`, { defaultValue: ({ circle: "Circle", square: "Square", diamond: "Diamond", triangle: "Triangle", cross: "Cross" })[shape] })}</option>)}</select></label>}
    {lines && <label className="block space-y-1 text-xs text-white/65"><span>{t("editor.charts.linePattern", { defaultValue: "Line pattern" })}</span><select disabled={multiple && !!value.seriesPatterns} value={value.linePattern ?? "solid"} onChange={event => onChange({ ...value, linePattern: event.target.value as ChartData["linePattern"] })} className="min-h-9 w-full rounded-lg border border-white/20 bg-neutral-900 px-3 disabled:opacity-35">{CHART_LINE_PATTERNS.map(pattern => <option key={pattern} value={pattern}>{t(`editor.charts.linePattern.${pattern}`, { defaultValue: ({ solid: "Solid", dashed: "Dashed", dotted: "Dotted", "dash-dot": "Dash and dot" })[pattern] })}</option>)}</select></label>}
    {multiple && <label className="flex min-h-9 items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={!!value.seriesPatterns} onChange={event => onChange({ ...value, seriesPatterns: event.target.checked })} />{t("editor.charts.seriesPatterns", { defaultValue: "Vary shapes and patterns by series" })}</label>}
    <p className="text-[10px] text-white/45">{t("editor.charts.markerHint", { defaultValue: "Shapes and line patterns provide another way to distinguish series. Legend keys follow the plot. Point size zero hides markers; bubble sizes keep their circular area scale." })}</p>
  </div>;
}
