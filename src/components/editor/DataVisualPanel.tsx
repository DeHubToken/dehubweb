import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "@/lib/editor/dataVisualProject";
import { parseChartData, parseTableData, type ChartKind } from "@/lib/editor/dataVisuals";
import { useEditorStore } from "@/store/editorStore";
import { nanoid } from "nanoid";

export function DataVisualPanel() {
  const { t } = useTranslation();
  const selected = useEditorStore(s => s.clips.find(c => s.selectedClipIds.length === 1 && c.id === s.selectedClipIds[0]));
  const chart = selected?.kind === "shape" ? selected.chart : undefined;
  const table = selected?.kind === "shape" ? selected.table : undefined;
  const [mode, setMode] = useState<"chart" | "table">(table ? "table" : "chart");
  const [kind, setKind] = useState<ChartKind>(chart?.kind ?? "column");
  const [data, setData] = useState("");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const next = table ? "table" : "chart";
    setMode(next);
    if (next === "chart") {
      const value = chart ?? DEFAULT_CHART;
      setKind(value.kind); setData(value.rows.map(row => `${row.label},${row.value}`).join("\n"));
      setForeground(value.textColour); setAccent(value.colours[0] ?? "#38bdf8"); setShowLabels(value.showLabels); setShowValues(value.showValues);
    } else {
      const value = table ?? DEFAULT_TABLE;
      setData(value.rows.map(row => row.join("\t")).join("\n")); setForeground(value.textColour); setAccent(value.headerColour); setShowLabels(value.header);
    }
    setError("");
  }, [selected?.id, chart, table]);
  const choose = (value: "chart" | "table") => {
    setMode(value); setError("");
    if (value === "table") {
      const next = table ?? DEFAULT_TABLE;
      setData(next.rows.map(row => row.join("\t")).join("\n")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    } else {
      const next = chart ?? DEFAULT_CHART;
      setData(next.rows.map(row => `${row.label},${row.value}`).join("\n")); setForeground(next.textColour); setAccent(next.colours[0] ?? "#38bdf8");
      setShowLabels(next.showLabels); setShowValues(next.showValues); setKind(next.kind);
    }
  };
  const apply = () => {
    try {
      const s = useEditorStore.getState(), before = s.toSnapshot();
      const value = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, rows: parseChartData(data),
        colours: [accent, ...(chart ?? DEFAULT_CHART).colours.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...(table ?? DEFAULT_TABLE), rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(before, s.currentTime, value, () => nanoid(10), s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null);
      if (result && s.applyDesignEdit(before, result.project)) s.selectClip(result.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {(["chart", "table"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => choose(value)} className={`min-h-9 rounded-lg border px-3 text-xs ${mode === value ? "border-white bg-white text-black" : "border-white/20 text-white/70"}`}>{t(`editor.dataVisual.${value}`, { defaultValue: value === "chart" ? "Chart" : "Table" })}</button>)}
      {mode === "chart" && <select value={kind} aria-label={t("editor.dataVisual.chartType", { defaultValue: "Chart type" })} onChange={e => setKind(e.target.value as ChartKind)} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{(["column", "bar", "line", "pie", "donut"] as const).map(value => <option key={value} value={value}>{t(`editor.dataVisual.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) })}</option>)}</select>}
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}<input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
    </div>
    <p className="text-xs text-white/55">{t(mode === "chart" ? "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</p>
    <textarea value={data} onChange={e => setData(e.target.value)} aria-label={t("editor.dataVisual.data", { defaultValue: "Data" })} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-xs outline-none focus:border-white/60" />
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</label>
      {mode === "chart" && <label className="flex items-center gap-2"><input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />{t("editor.dataVisual.values", { defaultValue: "Show values" })}</label>}
      <button type="button" disabled={!!selected?.locked && !!(chart || table)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
