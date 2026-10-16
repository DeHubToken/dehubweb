import { DataGraphicCaptionControls } from "./DataGraphicCaptionControls";
import { TableSampleGallery } from "./TableSampleGallery";
import { ChartSampleGallery } from "./ChartSampleGallery";
import { chartDraftAppearance } from "@/lib/editor/chartDraft";
import { ChartTypePicker } from "./ChartTypePicker";
import { treemapDataError } from "@/lib/editor/treemapChart";
import { histogramChartData } from "@/lib/editor/histogramChart";
import { HistogramObservationControls } from "./HistogramObservationControls";
import { DataGraphicFontControls } from "./DataGraphicFontControls";
import { TableBrandPalettes } from "./TableBrandPalettes";
import { ChartBrandPalettes } from "./ChartBrandPalettes";
import { TableFindReplaceControls } from "./TableFindReplaceControls";
import { TableStyleFileControls } from "./TableStyleFileControls";
import { convertDataVisualSource } from "@/lib/editor/dataVisualConversion";
import { ChartStyleFileControls } from "./ChartStyleFileControls";
import { chartStyleAppearance } from "@/lib/editor/chartStyleFile";
import { DataVisualVectorDownload } from "./DataVisualVectorDownload";
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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "@/lib/editor/dataVisualProject";
import { validDataVisuals, parseTableData, type ChartKind, type ChartData, type TableData } from "@/lib/editor/dataVisuals";
import { useEditorStore } from "@/store/editorStore";
import { nanoid } from "nanoid";

export function DataVisualPanel() {
  const { t } = useTranslation();
  const panelId = useId();
  const projectId = useEditorStore(store => store.projectId);
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
  const editData = useCallback((value: string) => { importRequest.current++; setData(value); setError(""); }, []);
  useEffect(() => { setFocusedCell(""); importRequest.current++; return () => { importRequest.current++; }; }, [projectId, selected?.id, mode]);
  const importFile = async (file?: File) => {
    if (!file) return;
    const request = ++importRequest.current;
    try {
      if (file.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await file.text();
      if (request !== importRequest.current || useEditorStore.getState().projectId !== projectId) return;
      setData(text.replace(/^\uFEFF/, "")); setError("");
    } catch (error) { if (request === importRequest.current) setError(error instanceof Error ? error.message : "Could not read this file"); }
  };
  useEffect(() => {
    importRequest.current++;
    const next = table ? "table" : "chart";
    setMode(next);
    if (next === "chart") {
      const value = chart ?? DEFAULT_CHART;
      setChartAppearance(chartDraftAppearance(value)); setChartPalette([...value.colours]); setKind(value.kind); setData(chartDataSource(value)); setMultiple(!!value.series?.length); setStacked(!!value.stacked); setStackPercent(!!value.stackPercent); setShowLegend(value.showLegend !== false);
      setForeground(value.textColour); setAccent(value.colours[0] ?? "#38bdf8"); setShowLabels(value.showLabels); setShowValues(value.showValues);
    } else {
      const value = table ?? DEFAULT_TABLE;
      setTableFormat({ ...value }); setData(formatDelimitedData(value.rows, "\t")); setForeground(value.textColour); setAccent(value.headerColour); setShowLabels(value.header);
    }
    setError("");
  }, [projectId, selected?.id, chart, table]);
  const choose = (value: "chart" | "table") => {
    importRequest.current++; setMode(value); setError("");
    if (value === "table") {
      const next = table ?? DEFAULT_TABLE;
      setTableFormat({ ...next }); setData(formatDelimitedData(next.rows, "\t")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    } else {
      const next = chart ?? DEFAULT_CHART;
      setChartPalette([...next.colours]);
      setChartAppearance(chartDraftAppearance(next));
      setData(chartDataSource(next)); setMultiple(!!next.series?.length); setStacked(!!next.stacked); setStackPercent(!!next.stackPercent); setShowLegend(next.showLegend !== false); setForeground(next.textColour); setAccent(next.colours[0] ?? "#38bdf8");
      setShowLabels(next.showLabels); setShowValues(next.showValues); setKind(next.kind);
    }
  };
  const useChartSample = (value: ChartData, colours: boolean) => {
    importRequest.current++; setMode("chart"); setKind(value.kind); setData(chartDataSource(value)); setMultiple(!!value.series?.length);
    setChartAppearance(chartDraftAppearance(value)); setStacked(!!value.stacked); setStackPercent(!!value.stackPercent); setShowLegend(value.showLegend !== false); setShowLabels(value.showLabels); setShowValues(value.showValues);
    if (colours) { setChartPalette([...value.colours]); setAccent(value.colours[0]); setForeground(value.textColour); }
    setDataView("cells"); setError("");
  };
  const useTableSample = (value: TableData, colours: boolean) => {
    importRequest.current++; setMode("table"); setData(formatDelimitedData(value.rows, "\t")); setShowLabels(value.header);
    const next = colours ? value : { ...value, headerColour: accent, textColour: foreground, headerTextColour: tableFormat.headerTextColour, cellColour: tableFormat.cellColour, borderColour: tableFormat.borderColour, stripeColour: tableFormat.stripeColour, cellStyles: value.cellStyles ? Object.fromEntries(Object.entries(value.cellStyles).map(([key, style]) => { const { fill, colour, ...format } = style; return [key, format]; })) : undefined };
    setTableFormat(next); if (colours) { setForeground(value.textColour); setAccent(value.headerColour); }
    setFocusedCell(""); setDataView("cells"); setError("");
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
  const categoryLabels = useMemo(() => { if ((multiple && kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "pictogram" && kind !== "bubble") || mode !== "chart" || kind === "radar") return []; try { return parseChartSource(data, multiple).rows.map(row => row.label); } catch { return []; } }, [data, multiple, mode, kind]);
  const seriesColour = (index: number) => index === 0 ? accent : chartPalette[index % chartPalette.length] ?? DEFAULT_CHART.colours[index % DEFAULT_CHART.colours.length];
  const setSeriesColour = (index: number, colour: string) => {
    if (index === 0) { setAccent(colour); return; }
    setChartPalette(previous => { const next = Array.from({ length: 6 }, (_, i) => previous[i % previous.length] ?? DEFAULT_CHART.colours[i % DEFAULT_CHART.colours.length]); next[index] = colour; return next; });
  };
  const changeTableStructure = (axis: TableAxis, index: number, action: TableStructureAction) => {
    importRequest.current++;
    try { const next = editTableStructure(data, { ...tableFormat, header: showLabels }, axis, index, action); setTableFormat(next.format); setData(next.source); setFocusedCell(axis === "row" ? `A${next.selected + 1}` : `${String.fromCharCode(65 + next.selected)}1`); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change this table"); }
  };
  const convertDraft = () => {
    importRequest.current++;
    try {
      const next = convertDataVisualSource(data, mode, multiple, showLabels, chartAppearance.xAxisTitle);
      choose(next.mode); setData(next.source); setMultiple(next.multiple);
      if (next.mode === "table") setShowLabels(next.header);
      else if (next.xAxisTitle) setChartAppearance(previous => ({ ...previous, xAxisTitle: next.xAxisTitle }));
      setError(""); setDataView("cells");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not convert this data"); }
  };
  const previewValue = useMemo(() => {
    try {
      const value = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend, colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } } : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      return validDataVisuals(value) ? value : null;
    } catch { return null; }
  }, [mode, chart, kind, data, multiple, chartAppearance, stacked, stackPercent, showLegend, accent, chartPalette, foreground, showLabels, showValues, tableFormat]);
  const draftPreviewValue = useMemo(() => previewValue && "chart" in previewValue && previewValue.chart?.kind === "race" ? { chart: { ...previewValue.chart, raceAnimate: false } } : previewValue, [previewValue]);
  const apply = () => {
    importRequest.current++;
    try {
      const s = useEditorStore.getState(), before = s.toSnapshot();
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend,
        colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if ("chart" in value && (kind === "scatter" || kind === "bubble") && value.chart.rows.some(row => !row.label.trim() || !Number.isFinite(Number(row.label)) || Math.abs(Number(row.label)) > 1e12)) throw new Error("Scatter and bubble charts need numeric X coordinates in the first column, within one trillion");
      if ("chart" in value && kind === "funnel" && (value.chart.rows.some(row => row.value < 0) || !value.chart.rows.some(row => row.value > 0))) throw new Error("Funnel stages need nonnegative values and at least one positive stage");
      if ("chart" in value && kind === "bubble" && value.chart.series?.[1] && (value.chart.series[1].values.some(size => size < 0) || !value.chart.series[1].values.some(size => size > 0))) throw new Error("Bubble sizes need nonnegative values and at least one positive size");
      if ("chart" in value && kind === "treemap") { const issue = treemapDataError(value.chart.rows); if (issue) throw new Error(issue); }
      if ("chart" in value && kind === "pictogram" && (value.chart.rows.some(row => row.value < 0) || !value.chart.rows.some(row => row.value > 0))) throw new Error("Pictograms need nonnegative values and at least one positive category");
      if ("chart" in value && kind === "race" && (!value.chart.series || value.chart.series.length < 2 || value.chart.series.some(frame => frame.values.some(number => number < 0)) || !value.chart.series.some(frame => frame.values.some(number => number > 0)))) throw new Error("Bar chart races need at least two nonnegative frame columns and one positive value");
      if (!validDataVisuals(value)) throw new Error("Use valid colours and table formatting");
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(before, s.currentTime, value, () => nanoid(10), s.selectedClipIds.length === 1 ? s.selectedClipIds[0] : null);
      if (result && s.applyDesignEdit(before, result.project)) s.selectClip(result.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {(["chart", "table"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => choose(value)} className={`min-h-9 rounded-lg border px-3 text-xs ${mode === value ? "border-white bg-white text-black" : "border-white/20 text-white/70"}`}>{t(`editor.dataVisual.${value}`, { defaultValue: value === "chart" ? "Chart" : "Table" })}</button>)}
    </div>
    {mode === "chart" && <ChartTypePicker value={kind} onChange={setKind} />}
    <DataVisualDraftPreview key={useEditorStore.getState().projectId} projectId={useEditorStore.getState().projectId} value={draftPreviewValue} width={previewSettings.width * (selected?.kind === "shape" && (chart || table) ? selected.w : 0.8)} height={previewSettings.height * (selected?.kind === "shape" && (chart || table) ? selected.h : 0.65)} background={previewSettings.background} />
    <div role="tablist" aria-label={t("editor.dataVisual.sections", { defaultValue: "Graphic editing sections" })} className="sticky top-0 z-10 flex gap-1 rounded-lg bg-neutral-950 p-1">{(["data", "design"] as const).map(value => <button key={value} type="button" role="tab" id={`${panelId}-${value}-tab`} aria-controls={`${panelId}-${value}-panel`} aria-selected={section === value} tabIndex={section === value ? 0 : -1} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "data" : event.key === "End" ? "design" : section === "data" ? "design" : "data"; setSection(next); const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button"); buttons?.[next === "data" ? 0 : 1]?.focus(); } }} onClick={() => setSection(value)} className={`min-h-10 flex-1 rounded-md px-3 text-xs font-medium ${section === value ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/5"}`}>{t(`editor.dataVisual.section.${value}`, { defaultValue: value === "data" ? "Data" : "Design" })}</button>)}</div>
    <div role="tabpanel" id={`${panelId}-data-panel`} aria-labelledby={`${panelId}-data-tab`} hidden={section !== "data"} className="space-y-3">
    {mode === "table" && <TableSampleGallery onUse={useTableSample} />}
    {mode === "chart" && <ChartSampleGallery onUse={useChartSample} />}
    {mode === "chart" && <div className="flex flex-wrap items-center gap-3 text-xs text-white/70"><label className="flex items-center gap-2"><input type="checkbox" checked={multiple} onChange={event => changeMultiple(event.target.checked)} />{t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })}</label>{multiple && <>{kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "bubble" && kind !== "histogram" && <label className="flex items-center gap-2"><input type="checkbox" checked={showLegend} onChange={event => setShowLegend(event.target.checked)} />{t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })}</label>}{(kind === "bar" || kind === "column") && <label className="flex items-center gap-2"><input type="checkbox" checked={stacked} onChange={event => setStacked(event.target.checked)} />{t("editor.dataVisual.stacked", { defaultValue: "Stack series" })}</label>}{(kind === "pie" || kind === "donut" || kind === "funnel" || kind === "treemap" || kind === "pictogram" || kind === "histogram") && <span className="text-white/45">{t("editor.dataVisual.singleSeriesViewHint", { defaultValue: "Pie, donut, funnel, treemap, pictogram and histogram charts display the first data series." })}</span>}</>}</div>}
    <p className="text-xs text-white/55">{t(mode === "chart" ? multiple ? "editor.dataVisual.seriesHint" : "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? multiple ? "First row: Label, followed by series names. Then one label and a number for each series per row. Up to 50 data rows and six series. Turning multiple series off keeps the first series." : "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</p>
    <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-white/20 px-3 text-xs hover:bg-white/10">{t("editor.dataVisual.import", { defaultValue: "Import CSV or TSV" })}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
    <div className="flex gap-2">{(["cells", "source"] as const).map(view => <button type="button" key={view} aria-pressed={dataView === view} onClick={() => setDataView(view)} className={`min-h-9 rounded-lg border px-3 text-xs ${dataView === view ? "border-white bg-white/15" : "border-white/20"}`}>{t(`editor.dataVisual.view.${view}`, { defaultValue: view === "cells" ? "Edit cells" : "Source data" })}</button>)}</div>
    {dataView === "cells" ? <DataCells value={data} onChange={editData} chart={mode === "chart"} multiSeries={multiple} onCellFocus={mode === "table" ? setFocusedCell : undefined} onStructure={mode === "table" ? changeTableStructure : undefined} /> : <textarea value={data} onChange={e => editData(e.target.value)} aria-label={t("editor.dataVisual.data", { defaultValue: "Data" })} rows={4} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-mono text-xs outline-none focus:border-white/60" />}
    {mode === "chart" && kind === "scatter" && <p className="text-xs text-white/55">{t("editor.charts.scatterHint", { defaultValue: "Scatter plots use numeric X coordinates in the first column and Y values in the remaining columns. Multiple series share those X coordinates." })}</p>}
    {mode === "chart" && kind === "bubble" && <div className="space-y-2"><p className="text-xs text-white/55">{t("editor.charts.bubbleHint", { defaultValue: "Use numeric X coordinates in the first column. In multiple-series mode, the first series gives Y positions and the second gives nonnegative bubble sizes. Areas are proportional to size; zero sizes are hidden. Without a size series, bubbles are equal. Extra series stay in the source data. Value labels show Y / size." })}</p><button type="button" onClick={() => { editData("X\tY\tSize\n10\t20\t15\n25\t35\t40\n40\t15\t25\n55\t45\t60"); setMultiple(true); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.charts.bubbleExample", { defaultValue: "Replace draft with bubble example" })}</button></div>}
    {mode === "chart" && kind === "treemap" && <div className="space-y-2"><p className="text-xs text-white/55">{t("editor.charts.treemapHint", { defaultValue: "Use unique leaf paths such as Europe / France and Europe / Germany. Up to six levels are supported. Values must be nonnegative, with at least one positive value. Zero values are hidden. A path cannot be both a group and a leaf. The first series supplies values; other source series are retained." })}</p><button type="button" onClick={() => { editData("Europe / France\t35\nEurope / Germany\t45\nAmericas / Brazil\t25\nAmericas / Canada\t30\nAsia / Japan\t40\nAsia / Korea\t20"); setMultiple(false); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.charts.treemapExample", { defaultValue: "Replace draft with treemap example" })}</button></div>}
    {mode === "chart" && kind === "race" && <div className="space-y-2"><p className="text-xs text-white/55">{t("editor.charts.raceHint", { defaultValue: "Use multiple-series data with categories in the first column. The following two to six columns are successive frames; their names appear as frame captions. Values must be nonnegative. Categories keep their colours as rankings change. Playback spans the graphic’s timeline duration." })}</p><button type="button" onClick={() => { editData("Category\t2024\t2025\t2026\nNorth\t35\t55\t75\nSouth\t60\t45\t80\nEast\t25\t70\t65\nWest\t50\t65\t90"); setMultiple(true); }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.charts.raceExample", { defaultValue: "Replace draft with ranking example" })}</button></div>}
    {mode === "chart" && kind === "funnel" && <p className="text-xs text-white/55">{t("editor.charts.funnelHint", { defaultValue: "Stages follow row order. Use nonnegative values with at least one positive stage. Stage colours, labels and values are edited separately." })}</p>}
    {mode === "chart" && multiple && <ChartSeriesControls source={data} onChange={(source, order) => { importRequest.current++; const colours = ["race", "funnel", "treemap", "pictogram", "bubble", "histogram"].includes(kind) ? [accent, ...chartPalette.slice(1)] : chartSeriesEditColours([accent, ...chartPalette.slice(1)], order, DEFAULT_CHART.colours); setData(source); setChartPalette(colours); setAccent(colours[0]); setError(""); }} />}
    {mode === "chart" && <ChartTransposeControl source={data} multiple={multiple} disabled={kind === "scatter" || kind === "pie" || kind === "donut" || kind === "histogram" || kind === "bubble"} onChange={source => { importRequest.current++; setData(source); setMultiple(true); setError(""); }} />}
    {mode === "chart" && kind !== "histogram" && <ChartDataOrderControls scatter={kind === "scatter" || kind === "bubble"} source={data} multiple={multiple} onChange={(source, order) => { importRequest.current++; setData(source); if ((!multiple || kind === "race" || kind === "funnel" || kind === "treemap" || kind === "pictogram" || kind === "bubble") && kind !== "radar") { const colours = reorderChartCategoryColours([accent, ...chartPalette.slice(1)], order); setChartPalette(colours); setAccent(colours[0]); } setError(""); }} />}
    {mode === "table" && <TableFindReplaceControls source={data} onChange={editData} />}
    {mode === "chart" && kind === "histogram" && <HistogramObservationControls key={`${projectId}:${selected?.id ?? "new"}`} onChange={source => { editData(source); setMultiple(false); }} />}
    {mode === "chart" && kind === "histogram" && previewValue && "chart" in previewValue && previewValue.chart && <details className="space-y-2 rounded-lg border border-white/10 p-3"><summary className="min-h-9 cursor-pointer text-xs text-white/75">{t("editor.charts.binCounts", { defaultValue: "Export histogram bin counts" })}</summary><DataExportControls source={formatDelimitedData([["Value range", "Frequency"], ...histogramChartData(previewValue.chart).rows.map(row => [row.label, row.value])], "\t")} mode="chart" multiple={true} title={useEditorStore.getState().title + "-bins"} /></details>}
    <DataExportControls source={data} mode={mode} multiple={multiple} title={useEditorStore.getState().title} />
    <button type="button" onClick={convertDraft} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t(mode === "chart" ? "editor.dataVisual.convertToTable" : "editor.dataVisual.convertToChart", { defaultValue: mode === "chart" ? "Use this data as a table" : "Use this data as a chart" })}</button>
    </div>
    <div role="tabpanel" id={`${panelId}-design-panel`} aria-labelledby={`${panelId}-design-tab`} hidden={section !== "design"} className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
      <label className="flex items-center gap-2 text-xs text-white/65">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}<input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-9 bg-transparent" /></label>
    </div>
    {mode === "chart" && (!multiple || kind === "race" || kind === "funnel" || kind === "treemap" || kind === "pictogram" || kind === "bubble") && kind !== "radar" && kind !== "histogram" && <ChartCategoryColours key={useEditorStore.getState().projectId + ":" + (selected?.id ?? "new")} labels={categoryLabels} colours={[accent, ...chartPalette.slice(1)]} onChange={colours => { setChartPalette(colours); setAccent(colours[0]); }} projectId={useEditorStore.getState().projectId} />}
    {mode === "chart" && <div className="flex flex-wrap gap-2">{DESIGN_PALETTES.map(palette => <button type="button" key={palette.id} onClick={() => { setChartPalette([...palette.colours]); setAccent(palette.colours[0]); }} className="flex min-h-9 items-center gap-2 rounded-lg border border-white/15 px-2 text-xs hover:bg-white/10"><span className="flex overflow-hidden rounded">{palette.colours.map(colour => <span key={colour} className="h-4 w-3" style={{ background: colour }} />)}</span>{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</button>)}</div>}
    {mode === "chart" && multiple && kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "pictogram" && kind !== "bubble" && kind !== "histogram" && <div className="flex flex-wrap gap-3">{seriesNames.map((name, index) => <label key={index} className="flex min-w-0 items-center gap-2 text-xs text-white/65"><input type="color" value={seriesColour(index)} onChange={event => setSeriesColour(index, event.target.value)} className="h-8 w-9 bg-transparent" /><span className="max-w-36 truncate" title={name}>{name}</span></label>)}</div>}
    {mode === "table" && <div className="flex flex-wrap items-center gap-3 text-xs">
      {(["cellColour", "headerTextColour", "borderColour"] as const).map(key => <label key={key} className="flex items-center gap-2">{t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: ({ cellColour: "Cells", headerTextColour: "Header text", borderColour: "Grid" })[key] })}<input type="color" value={tableFormat[key]} onChange={e => setTableFormat(value => ({ ...value, [key]: e.target.value }))} className="h-8 w-9 bg-transparent" /></label>)}
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.checked ? "#262626" : null }))} />{t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating cells" })}</label>
      {tableFormat.stripeColour && <input type="color" value={tableFormat.stripeColour} onChange={e => setTableFormat(value => ({ ...value, stripeColour: e.target.value }))} aria-label={t("editor.dataVisual.tableStyle.stripeColour", { defaultValue: "Alternating row colour" })} className="h-8 w-9 bg-transparent" />}
      <select value={tableFormat.align ?? "left"} onChange={e => setTableFormat(value => ({ ...value, align: e.target.value as TableData["align"] }))} aria-label={t("editor.dataVisual.tableStyle.alignment", { defaultValue: "Cell alignment" })} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2">{(["left", "centre", "right"] as const).map(align => <option key={align} value={align}>{t(`editor.dataVisual.tableStyle.${align}`, { defaultValue: align === "left" ? "Left" : align === "centre" ? "Centre" : "Right" })}</option>)}</select>
      <label>{t("editor.dataVisual.tableStyle.borderWidth", { defaultValue: "Grid width" })}<input type="number" min={0} max={8} step={0.5} value={tableFormat.borderWidth ?? 1} onChange={e => setTableFormat(value => ({ ...value, borderWidth: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))} className="ml-2 min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2" /></label>
    </div>}
    {mode === "chart" && multiple && stacked && (kind === "bar" || kind === "column") && <div className="space-y-2"><label className="flex items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={stackPercent} onChange={event => setStackPercent(event.target.checked)} />{t("editor.charts.percentStack", { defaultValue: "100% stacked" })}</label>{stackPercent && <p className="text-[10px] text-white/45">{t("editor.charts.percentStackHint", { defaultValue: "Each category shows percentage shares. Positive and negative values each total 100% on their side of zero. Source values stay in the data grid and CSV downloads." })}</p>}</div>}
    <DataGraphicCaptionControls value={mode === "chart" ? chartAppearance : tableFormat} onChange={metadata => mode === "chart" ? setChartAppearance(previous => ({ ...previous, ...metadata })) : setTableFormat(previous => ({ ...previous, ...metadata }))} />
    <DataGraphicFontControls value={mode === "chart" ? chartAppearance.fontFamily : tableFormat.fontFamily} onChange={fontFamily => mode === "chart" ? setChartAppearance(previous => ({ ...previous, fontFamily })) : setTableFormat(previous => ({ ...previous, fontFamily }))} />
    {mode === "chart" && <ChartBrandPalettes value={[accent, ...chartPalette.slice(1)]} onChange={colours => { setChartPalette(colours); setAccent(colours[0]); }} />}
    {mode === "chart" && <ChartStyleFileControls key={`${projectId}:${selected?.id ?? "new"}`} value={previewValue && "chart" in previewValue ? previewValue.chart ?? null : null} title={useEditorStore.getState().title} onApply={(style, numbers) => { setChartAppearance(previous => ({ ...previous, ...chartStyleAppearance(style), ...(numbers ? { valueFormat: style.valueFormat } : {}) })); setChartPalette([...style.colours]); setAccent(style.colours[0]); setForeground(style.textColour); setShowLabels(style.showLabels); setShowValues(style.showValues); setShowLegend(style.showLegend !== false); }} />}
    {mode === "chart" && <ChartStyleGallery value={chartAppearance} onApply={(preset, colours) => { setChartAppearance(previous => ({ ...previous, ...preset.geometry, ...((kind === "scatter" || kind === "bubble" || kind === "dot") ? { pointSize: Math.max(0.5, preset.geometry.pointSize ?? 1) } : {}) })); if (colours) { setChartPalette([...preset.colours]); setAccent(preset.colours[0]); } }} />}
    {mode === "chart" && <ChartFormattingPanel samples={previewValue && "chart" in previewValue && previewValue.chart ? kind === "bubble" ? previewValue.chart.rows.map(row => row.value) : previewValue.chart.series?.flatMap(series => series.values) ?? previewValue.chart.rows.map(row => row.value) : []} percentStack={multiple && stacked && stackPercent && (kind === "bar" || kind === "column")} multiple={multiple} kind={kind} value={chartAppearance} onChange={setChartAppearance} />}
    <div className="flex flex-wrap gap-2"><ColourPickerButton projectId={useEditorStore.getState().projectId} onPick={setAccent} label={t("editor.colourPicker.accent", { defaultValue: "Pick accent from canvas" })} /><ColourPickerButton projectId={useEditorStore.getState().projectId} onPick={setForeground} label={t("editor.colourPicker.ink", { defaultValue: "Pick text colour from canvas" })} /></div>
    {mode === "table" && <TableBrandPalettes value={{ ...tableFormat, headerColour: accent, textColour: foreground }} onChange={value => { setTableFormat(value); setAccent(value.headerColour); setForeground(value.textColour); }} />}
    {mode === "table" && <TableStyleFileControls key={`${projectId}:${selected?.id ?? "new"}`} value={previewValue && "table" in previewValue ? previewValue.table ?? null : null} title={useEditorStore.getState().title} onApply={(style, headers) => { setTableFormat(previous => ({ ...previous, ...style, header: headers ? style.header : previous.header, headerColumn: headers ? style.headerColumn : previous.headerColumn })); setForeground(style.textColour); setAccent(style.headerColour); if (headers) setShowLabels(style.header); }} />}
    {mode === "table" && <TableStyleGallery value={{ ...tableFormat, textColour: foreground, headerColour: accent }} onChange={value => { setTableFormat(value); setForeground(value.textColour); setAccent(value.headerColour); }} />}
    {mode === "table" && <TableFormattingPanel focusedCell={focusedCell} value={{ ...tableFormat, header: showLabels }} source={data} onChange={value => { setTableFormat(value); setShowLabels(value.header); }} onSource={editData} />}
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</label>
      {mode === "chart" && <label className="flex items-center gap-2"><input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />{t("editor.dataVisual.values", { defaultValue: "Show values" })}</label>}
    </div>
    </div>
    <DataVisualVectorDownload key={`${projectId}:${selected?.id ?? "new"}`} projectId={projectId} value={previewValue} width={previewSettings.width * (selected?.kind === "shape" && (chart || table) ? selected.w : 0.8)} height={previewSettings.height * (selected?.kind === "shape" && (chart || table) ? selected.h : 0.65)} title={useEditorStore.getState().title} />
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-white/10 bg-neutral-950 py-3 text-xs">
      <button type="button" onClick={() => choose(mode)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/65">{t("editor.dataVisual.resetDraft", { defaultValue: "Reset draft" })}</button>
      <button type="button" disabled={!!selected?.locked && !!(chart || table)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
