import { DataVisualDraftPreview } from "./DataVisualDraftPreview";
import { ChartTransposeControl } from "./ChartTransposeControl";
import { ChartStyleGallery } from "./ChartStyleGallery";
import { chartSeriesEditColours } from "@/lib/editor/chartSeriesStructure";
import { ChartSeriesControls } from "./ChartSeriesControls";
import { reorderChartCategoryColours } from "@/lib/editor/chartDataOrder";
import { ChartDataOrderControls } from "./ChartDataOrderControls";
import { TableStyleGallery } from "./TableStyleGallery";
import { editTableStructure, type TableAxis, type TableStructureAction } from "@/lib/editor/tableStructure";
import { ChartCategoryColours } from "./ChartCategoryColours";
import { DataExportControls } from "./DataExportControls";
import { ColourPickerButton } from "./ColourPickerButton";
import { ChartFormattingPanel, type ChartAppearance } from "./ChartFormattingPanel";
import { chartDataSource, parseChartSource } from "@/lib/editor/chartSeries";
import { TableFormattingPanel } from "./TableFormattingPanel";
import { DESIGN_PALETTES } from "@/lib/editor/designTools";
import { DataCells } from "./DataCells";
import { formatDelimitedData } from "@/lib/editor/delimitedData";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "@/lib/editor/dataVisualProject";
import { CHART_KINDS, validDataVisuals, parseTableData, type ChartKind, type ChartData, type TableData } from "@/lib/editor/dataVisuals";
import { useEditorStore } from "@/store/editorStore";
import { nanoid } from "nanoid";

export function DataVisualPanel() {
  const { t } = useTranslation();
  const panelId = useId();
  const previewSettings = useEditorStore(store => store.settings);
  const selected = useEditorStore(s => s.clips.find(c => s.selectedClipIds.length === 1 && c.id === s.selectedClipIds[0]));
  const chart = selected?.kind === "shape" ? selected.chart : undefined;
  const table = selected?.kind === "shape" ? selected.table : undefined;
  const [mode, setMode] = useState<"chart" | "table">(table ? "table" : "chart");
  const [kind, setKind] = useState<ChartKind>(chart?.kind ?? "column");
  const [data, setData] = useState("");
  const [section, setSection] = useState<"data" | "design">("data");
  const [focusedCell, setFocusedCell] = useState("");
  const [dataView, setDataView] = useState<"cells" | "source">("cells");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [chartPalette, setChartPalette] = useState<string[]>([...DEFAULT_CHART.colours]);
  const [chartAppearance, setChartAppearance] = useState<ChartAppearance>({});
  const [tableFormat, setTableFormat] = useState<Omit<TableData, "rows">>({ ...DEFAULT_TABLE });
  const [multiple, setMultiple] = useState(false), [stacked, setStacked] = useState(false), [stackPercent, setStackPercent] = useState(false), [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  const importRequest = useRef(0);
  useEffect(() => { setFocusedCell(""); importRequest.current++; return () => { importRequest.current++; }; }, [selected?.id, mode]);
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
      setChartAppearance({ xAxisTitle: value.xAxisTitle, yAxisTitle: value.yAxisTitle, valueFormat: value.valueFormat, donutHole: value.donutHole, donutLabel: value.donutLabel, donutTotal: value.donutTotal, lineWidth: value.lineWidth, lineStyle: value.lineStyle, pointSize: value.pointSize, areaOpacity: value.areaOpacity, barGap: value.barGap, showGrid: value.showGrid, showAxisValues: value.showAxisValues, legendPosition: value.legendPosition, scaleMin: value.scaleMin, scaleMax: value.scaleMax }); setChartPalette([...value.colours]); setKind(value.kind); setData(chartDataSource(value)); setMultiple(!!value.series?.length); setStacked(!!value.stacked); setStackPercent(!!value.stackPercent); setShowLegend(value.showLegend !== false);
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
      setChartAppearance({ xAxisTitle: next.xAxisTitle, yAxisTitle: next.yAxisTitle, valueFormat: next.valueFormat, donutHole: next.donutHole, donutLabel: next.donutLabel, donutTotal: next.donutTotal, lineWidth: next.lineWidth, lineStyle: next.lineStyle, pointSize: next.pointSize, areaOpacity: next.areaOpacity, barGap: next.barGap, showGrid: next.showGrid, showAxisValues: next.showAxisValues, legendPosition: next.legendPosition, scaleMin: next.scaleMin, scaleMax: next.scaleMax });
      setData(chartDataSource(next)); setMultiple(!!next.series?.length); setStacked(!!next.stacked); setStackPercent(!!next.stackPercent); setShowLegend(next.showLegend !== false); setForeground(next.textColour); setAccent(next.colours[0] ?? "#38bdf8");
      setShowLabels(next.showLabels); setShowValues(next.showValues); setKind(next.kind);
    }
  };
  const changeMultiple = (value: boolean) => {
    importRequest.current++;
    try { const parsed = parseChartSource(data, multiple); setData(chartDataSource({ ...DEFAULT_CHART, ...parsed }, value)); } catch { /* Keep pasted source available for correction in its new format. */ }
    setMultiple(value); setError("");
  };
  const seriesNames = useMemo(() => {
    if (!multiple) return [];
    try { return parseChartSource(data, true).series?.map(series => series.label) ?? []; } catch { return []; }
  }, [data, multiple]);
  const categoryLabels = useMemo(() => { if (multiple || mode !== "chart" || kind === "radar") return []; try { return parseChartSource(data, false).rows.map(row => row.label); } catch { return []; } }, [data, multiple, mode, kind]);
  const seriesColour = (index: number) => index === 0 ? accent : chartPalette[index % chartPalette.length] ?? DEFAULT_CHART.colours[index % DEFAULT_CHART.colours.length];
  const setSeriesColour = (index: number, colour: string) => {
    if (index === 0) { setAccent(colour); return; }
    setChartPalette(previous => { const next = Array.from({ length: 6 }, (_, i) => previous[i % previous.length] ?? DEFAULT_CHART.colours[i % DEFAULT_CHART.colours.length]); next[index] = colour; return next; });
  };
  const changeTableStructure = (axis: TableAxis, index: number, action: TableStructureAction) => {
    try { const next = editTableStructure(data, { ...tableFormat, header: showLabels }, axis, index, action); setTableFormat(next.format); setData(next.source); setFocusedCell(axis === "row" ? `A${next.selected + 1}` : `${String.fromCharCode(65 + next.selected)}1`); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change this table"); }
  };
  const previewValue = useMemo(() => {
    try {
      const value = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend, colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } } : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      return validDataVisuals(value) ? value : null;
    } catch { return null; }
  }, [mode, chart, kind, data, multiple, chartAppearance, stacked, stackPercent, showLegend, accent, chartPalette, foreground, showLabels, showValues, tableFormat]);
  const apply = () => {
    try {
      const s = useEditorStore.getState(), before = s.toSnapshot();
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend,
        colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if ("chart" in value && kind === "scatter" && value.chart.rows.some(row => !row.label.trim() || !Number.isFinite(Number(row.label)) || Math.abs(Number(row.label)) > 1e12)) throw new Error("Scatter charts need numeric X coordinates in the first column, within one trillion");
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
    </div>
    <DataVisualDraftPreview key={useEditorStore.getState().projectId} projectId={useEditorStore.getState().projectId} value={previewValue} width={previewSettings.width * (selected?.kind === "shape" && (chart || table) ? selected.w : 0.8)} height={previewSettings.height * (selected?.kind === "shape" && (chart || table) ? selected.h : 0.65)} background={previewSettings.background} />
    <div role="tablist" aria-label={t("editor.dataVisual.sections", { defaultValue: "Graphic editing sections" })} className="sticky top-0 z-10 flex gap-1 rounded-lg bg-neutral-950 p-1">{(["data", "design"] as const).map(value => <button key={value} type="button" role="tab" id={`${panelId}-${value}-tab`} aria-controls={`${panelId}-${value}-panel`} aria-selected={section === value} tabIndex={section === value ? 0 : -1} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "data" : event.key === "End" ? "design" : section === "data" ? "design" : "data"; setSection(next); const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button"); buttons?.[next === "data" ? 0 : 1]?.focus(); } }} onClick={() => setSection(value)} className={`min-h-10 flex-1 rounded-md px-3 text-xs font-medium ${section === value ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/5"}`}>{t(`editor.dataVisual.section.${value}`, { defaultValue: value === "data" ? "Data" : "Design" })}</button>)}</div>
    <div role="tabpanel" id={`${panelId}-data-panel`} aria-labelledby={`${panelId}-data-tab`} hidden={section !== "data"} className="space-y-3">
    {mode === "chart" && <div className="flex flex-wrap items-center gap-3 text-xs text-white/70"><label className="flex items-center gap-2"><input type="checkbox" checked={multiple} onChange={event => changeMultiple(event.target.checked)} />{t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })}</label>{multiple && <><label className="flex items-center gap-2"><input type="checkbox" checked={showLegend} onChange={event => setShowLegend(event.target.checked)} />{t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })}</label>{(kind === "bar" || kind === "column") && <label className="flex items-center gap-2"><input type="checkbox" checked={stacked} onChange={event => setStacked(event.target.checked)} />{t("editor.dataVisual.stacked", { defaultValue: "Stack series" })}</label>}{(kind === "pie" || kind === "donut") && <span className="text-white/45">{t("editor.dataVisual.pieSeriesHint", { defaultValue: "Pie and donut charts display the first data series." })}</span>}</>}</div>}
    <p className="text-xs text-white/55">{t(mode === "chart" ? multiple ? "editor.dataVisual.seriesHint" : "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? multiple ? "First row: Label, followed by series names. Then one label and a number for each series per row. Up to 50 data rows and six series. Turning multiple series off keeps the first series." : "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</p>
    <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-white/20 px-3 text-xs hover:bg-white/10">{t("editor.dataVisual.import", { defaultValue: "Import CSV or TSV" })}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
    <div className="flex gap-2">{(["cells", "source"] as const).map(view => <button type="button" key={view} aria-pressed={dataView === view} onClick={() => setDataView(view)} className={`min-h-9 rounded-lg border px-3 text-xs ${dataView === view ? "border-white bg-white/15" : "border-white/20"}`}>{t(`editor.dataVisual.view.${view}`, { defaultValue: view === "cells" ? "Edit cells" : "Source data" })}</button>)}</div>
    {dataView === "cells" ? <DataCells value={data} onChange={setData} chart={mode === "chart"} multiSeries={multiple} onCellFocus={mode === "table" ? setFocusedCell : undefined} onStructure={mode === "table" ? changeTableStructure : undefined} /> : <textarea value={data} onChange={e => setData(e.target.value)} aria-label={t("editor.dataVisual.data", { defaultValue: "Data" })} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-xs outline-none focus:border-white/60" />}
    {mode === "chart" && kind === "scatter" && <p className="text-xs text-white/55">{t("editor.charts.scatterHint", { defaultValue: "Scatter plots use numeric X coordinates in the first column and Y values in the remaining columns. Multiple series share those X coordinates." })}</p>}
    {mode === "chart" && multiple && <ChartSeriesControls source={data} onChange={(source, order) => { importRequest.current++; const colours = chartSeriesEditColours([accent, ...chartPalette.slice(1)], order, DEFAULT_CHART.colours); setData(source); setChartPalette(colours); setAccent(colours[0]); setError(""); }} />}
    {mode === "chart" && <ChartTransposeControl source={data} multiple={multiple} disabled={kind === "scatter" || kind === "pie" || kind === "donut"} onChange={source => { importRequest.current++; setData(source); setMultiple(true); setError(""); }} />}
    {mode === "chart" && <ChartDataOrderControls source={data} multiple={multiple} onChange={(source, order) => { importRequest.current++; setData(source); if (!multiple && kind !== "radar") { const colours = reorderChartCategoryColours([accent, ...chartPalette.slice(1)], order); setChartPalette(colours); setAccent(colours[0]); } setError(""); }} />}
    <DataExportControls source={data} mode={mode} multiple={multiple} title={useEditorStore.getState().title} />
    </div>
    <div role="tabpanel" id={`${panelId}-design-panel`} aria-labelledby={`${panelId}-design-tab`} hidden={section !== "design"} className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}<input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
    </div>
    {mode === "chart" && !multiple && kind !== "radar" && <ChartCategoryColours key={useEditorStore.getState().projectId + ":" + (selected?.id ?? "new")} labels={categoryLabels} colours={[accent, ...chartPalette.slice(1)]} onChange={colours => { setChartPalette(colours); setAccent(colours[0]); }} projectId={useEditorStore.getState().projectId} />}
    {mode === "chart" && <div className="flex flex-wrap gap-2">{DESIGN_PALETTES.map(palette => <button type="button" key={palette.id} onClick={() => { setChartPalette([...palette.colours]); setAccent(palette.colours[0]); }} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-2 text-xs hover:bg-white/10"><span className="flex overflow-hidden rounded">{palette.colours.map(colour => <span key={colour} className="h-4 w-3" style={{ background: colour }} />)}</span>{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</button>)}</div>}
    {mode === "chart" && multiple && <div className="flex flex-wrap gap-3">{seriesNames.map((name, index) => <label key={index} className="flex min-w-0 items-center gap-2 text-xs text-white/65"><input type="color" value={seriesColour(index)} onChange={event => setSeriesColour(index, event.target.value)} className="h-8 w-9 bg-transparent" /><span className="max-w-36 truncate" title={name}>{name}</span></label>)}</div>}
    {mode === "table" && <div className="flex flex-wrap items-center gap-3 text-xs">
      {(["cellColour", "headerTextColour", "borderColour"] as const).map(key => <label key={key} className="flex items-center gap-2">{t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: ({ cellColour: "Cells", headerTextColour: "Header text", borderColour: "Grid" })[key] })}<input type="color" value={tableFormat[key]} onChange={e => setTableFormat(value => ({ ...value, [key]: e.target.value }))} className="h-8 w-9 bg-transparent" /></label>)}
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.checked ? "#262626" : null }))} />{t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating cells" })}</label>
      {tableFormat.stripeColour && <input type="color" value={tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.value }))} aria-label={t("editor.dataVisual.tableStyle.stripeColour", { defaultValue: "Alternating row colour" })} className="h-8 w-9 bg-transparent" />}
      <select value={tableFormat.align ?? "left"} onChange={e => setTableFormat(value => ({ ...value, align: e.target.value as TableData["align"] }))} aria-label={t("editor.dataVisual.tableStyle.alignment", { defaultValue: "Cell alignment" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2">{(["left", "centre", "right"] as const).map(align => <option key={align} value={align}>{t(`editor.dataVisual.tableStyle.${align}`, { defaultValue: align === "left" ? "Left" : align === "centre" ? "Centre" : "Right" })}</option>)}</select>
      <label>{t("editor.dataVisual.tableStyle.borderWidth", { defaultValue: "Grid width" })}<input type="number" min={0} max={8} step={0.5} value={tableFormat.borderWidth ?? 1} onChange={e => setTableFormat(value => ({ ...value, borderWidth: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))} className="ml-2 min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
    </div>}
    {mode === "chart" && multiple && stacked && (kind === "bar" || kind === "column") && <div className="space-y-2"><label className="flex items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={stackPercent} onChange={event => setStackPercent(event.target.checked)} />{t("editor.charts.percentStack", { defaultValue: "100% stacked" })}</label>{stackPercent && <p className="text-[10px] text-white/45">{t("editor.charts.percentStackHint", { defaultValue: "Each category shows percentage shares. Positive and negative values each total 100% on their side of zero. Source values stay in the data grid and CSV downloads." })}</p>}</div>}
    {mode === "chart" && <ChartStyleGallery value={chartAppearance} onApply={(preset, colours) => { setChartAppearance(previous => ({ ...previous, ...preset.geometry })); if (colours) { setChartPalette([...preset.colours]); setAccent(preset.colours[0]); } }} />}
    {mode === "chart" && <ChartFormattingPanel percentStack={multiple && stacked && stackPercent && (kind === "bar" || kind === "column")} multiple={multiple} kind={kind} value={chartAppearance} onChange={setChartAppearance} />}
    <div className="flex flex-wrap gap-2"><ColourPickerButton projectId={useEditorStore.getState().projectId} onPick={setAccent} label={t("editor.colourPicker.accent", { defaultValue: "Pick accent from canvas" })} /><ColourPickerButton projectId={useEditorStore.getState().projectId} onPick={setForeground} label={t("editor.colourPicker.ink", { defaultValue: "Pick text colour from canvas" })} /></div>
    {mode === "table" && <TableStyleGallery value={{ ...tableFormat, textColour: foreground, headerColour: accent }} onChange={value => { setTableFormat(value); setForeground(value.textColour); setAccent(value.headerColour); }} />}
    {mode === "table" && <TableFormattingPanel focusedCell={focusedCell} value={{ ...tableFormat, header: showLabels }} source={data} onChange={value => { setTableFormat(value); setShowLabels(value.header); }} onSource={setData} />}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</label>
      {mode === "chart" && <label className="flex items-center gap-2"><input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />{t("editor.dataVisual.values", { defaultValue: "Show values" })}</label>}
    </div>
    </div>
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-white/10 bg-neutral-950 py-3 text-xs">
      <button type="button" disabled={!!selected?.locked && !!(chart || table)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
