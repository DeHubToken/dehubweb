import { DESIGN_PALETTES } from "@/lib/editor/designTools";
import { DataCells } from "./DataCells";
import { formatDelimitedData } from "@/lib/editor/delimitedData";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "@/lib/editor/dataVisualProject";
import { CHART_KINDS, validDataVisuals, parseChartData, parseTableData, type ChartKind, type ChartData, type TableData } from "@/lib/editor/dataVisuals";
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
  const [dataView, setDataView] = useState<"cells" | "source">("cells");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [chartPalette, setChartPalette] = useState<string[]>([...DEFAULT_CHART.colours]);
  const [tableFormat, setTableFormat] = useState<Omit<TableData, "rows">>({ ...DEFAULT_TABLE });
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  const importRequest = useRef(0);
  useEffect(() => { importRequest.current++; return () => { importRequest.current++; }; }, [selected?.id, mode]);
  const importFile = async (file?: File) => {
    if (!file) return;
    const request = ++importRequest.current;
    try {
      if (file.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await file.text();
      if (request !== importRequest.current) return;
      setData(text.replace(/^\uFEFF/, "")); setError("");
    } catch (error) { if (request === importRequest.current) setError(error instanceof Error ? error.message : "Could not read this file"); }
  };
  useEffect(() => {
    const next = table ? "table" : "chart";
    setMode(next);
    if (next === "chart") {
      const value = chart ?? DEFAULT_CHART;
      setChartPalette([...value.colours]); setKind(value.kind); setData(formatDelimitedData(value.rows.map(row => [row.label, row.value])));
      setForeground(value.textColour); setAccent(value.colours[0] ?? "#38bdf8"); setShowLabels(value.showLabels); setShowValues(value.showValues);
    } else {
      const value = table ?? DEFAULT_TABLE;
      setTableFormat({ ...value }); setData(formatDelimitedData(value.rows, "\t")); setForeground(value.textColour); setAccent(value.headerColour); setShowLabels(value.header);
    }
    setError("");
  }, [selected?.id, chart, table]);
  const choose = (value: "chart" | "table") => {
    setMode(value); setError("");
    if (value === "table") {
      const next = table ?? DEFAULT_TABLE;
      setTableFormat({ ...next }); setData(formatDelimitedData(next.rows, "\t")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    } else {
      const next = chart ?? DEFAULT_CHART;
      setData(formatDelimitedData(next.rows.map(row => [row.label, row.value]))); setForeground(next.textColour); setAccent(next.colours[0] ?? "#38bdf8");
      setShowLabels(next.showLabels); setShowValues(next.showValues); setKind(next.kind);
    }
  };
  const apply = () => {
    try {
      const s = useEditorStore.getState(), before = s.toSnapshot();
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, rows: parseChartData(data),
        colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if (!validDataVisuals(value)) throw new Error("Use valid colours and table formatting");
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(before, s.currentTime, value, () => nanoid(10), s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null);
      if (result && s.applyDesignEdit(before, result.project)) s.selectClip(result.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {(["chart", "table"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => choose(value)} className={`min-h-9 rounded-lg border px-3 text-xs ${mode === value ? "border-white bg-white text-black" : "border-white/20 text-white/70"}`}>{t(`editor.dataVisual.${value}`, { defaultValue: value === "chart" ? "Chart" : "Table" })}</button>)}
      {mode === "chart" && <select value={kind} aria-label={t("editor.dataVisual.chartType", { defaultValue: "Chart type" })} onChange={e => setKind(e.target.value as ChartKind)} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{CHART_KINDS.map(value => <option key={value} value={value}>{t(`editor.dataVisual.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) })}</option>)}</select>}
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}<input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
    </div>
    {mode === "chart" && <div className="flex flex-wrap gap-2">{DESIGN_PALETTES.map(palette => <button type="button" key={palette.id} onClick={() => { setChartPalette([...palette.colours]); setAccent(palette.colours[0]); }} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-2 text-xs hover:bg-white/10"><span className="flex overflow-hidden rounded">{palette.colours.map(colour => <span key={colour} className="h-4 w-3" style={{ background: colour }} />)}</span>{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</button>)}</div>}
    {mode === "table" && <div className="flex flex-wrap items-center gap-3 text-xs">
      {(["cellColour", "headerTextColour", "borderColour"] as const).map(key => <label key={key} className="flex items-center gap-2">{t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: ({ cellColour: "Cells", headerTextColour: "Header text", borderColour: "Grid" })[key] })}<input type="color" value={tableFormat[key]} onChange={e => setTableFormat(value => ({ ...value, [key]: e.target.value }))} className="h-8 w-9 bg-transparent" /></label>)}
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.checked ? "#262626" : null }))} />{t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating rows" })}</label>
      {tableFormat.stripeColour && <input type="color" value={tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.value }))} aria-label={t("editor.dataVisual.tableStyle.stripeColour", { defaultValue: "Alternating row colour" })} className="h-8 w-9 bg-transparent" />}
      <select value={tableFormat.align ?? "left"} onChange={e => setTableFormat(value => ({ ...value, align: e.target.value as TableData["align"] }))} aria-label={t("editor.dataVisual.tableStyle.alignment", { defaultValue: "Cell alignment" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2">{(["left", "centre", "right"] as const).map(align => <option key={align} value={align}>{t(`editor.dataVisual.tableStyle.${align}`, { defaultValue: align === "left" ? "Left" : align === "centre" ? "Centre" : "Right" })}</option>)}</select>
      <label>{t("editor.dataVisual.tableStyle.borderWidth", { defaultValue: "Grid width" })}<input type="number" min={0} max={8} step={0.5} value={tableFormat.borderWidth ?? 1} onChange={e => setTableFormat(value => ({ ...value, borderWidth: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))} className="ml-2 min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
    </div>}
    <p className="text-xs text-white/55">{t(mode === "chart" ? "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</p>
    <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-white/20 px-3 text-xs hover:bg-white/10">{t("editor.dataVisual.import", { defaultValue: "Import CSV or TSV" })}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
    <div className="flex gap-2">{(["cells", "source"] as const).map(view => <button type="button" key={view} aria-pressed={dataView === view} onClick={() => setDataView(view)} className={`min-h-9 rounded-lg border px-3 text-xs ${dataView === view ? "border-white bg-white/15" : "border-white/20"}`}>{t(`editor.dataVisual.view.${view}`, { defaultValue: view === "cells" ? "Edit cells" : "Source data" })}</button>)}</div>
    {dataView === "cells" ? <DataCells value={data} onChange={setData} chart={mode === "chart"} /> : <textarea value={data} onChange={e => setData(e.target.value)} aria-label={t("editor.dataVisual.data", { defaultValue: "Data" })} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-xs outline-none focus:border-white/60" />}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</label>
      {mode === "chart" && <label className="flex items-center gap-2"><input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />{t("editor.dataVisual.values", { defaultValue: "Show values" })}</label>}
      <button type="button" disabled={!!selected?.locked && !!(chart || table)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
