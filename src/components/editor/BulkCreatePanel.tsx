import { BulkConnectionFileControls } from "./BulkConnectionFileControls";
import { BulkAutoConnectControls } from "./BulkAutoConnectControls";
import { BulkPlaceholderControls } from "./BulkPlaceholderControls";
import { BulkPagePreview } from "./BulkPagePreview";
import { DataImportMappingControls } from "./DataImportMappingControls";
import { PasteDataImportControls } from "./PasteDataImportControls";
import { BulkDataExportControls } from "./BulkDataExportControls";
import { BulkPhotoNames } from "./BulkPhotoNames";
import { BulkPhotoConnectionsControls } from "./BulkPhotoConnectionsControls";
import { bulkImageFields, bulkPhotoNames } from "@/lib/editor/bulkPhotos";
import { BulkLinkConnectionsControls } from "./BulkLinkConnectionsControls";
import { BulkRowFilterControls } from "./BulkRowFilterControls";
import { bulkSelectedRows, bulkSelectedCount, type BulkRowFilter } from "@/lib/editor/bulkRowFilter";
import { BulkPageFieldsControls } from "./BulkPageFieldsControls";
import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { bulkLinkFields, bulkPageFieldsConnected, type BulkPageFields, bulkConnected, bulkFieldText, bulkTemplateFields, bulkTextPreviewValue, createBulkPages, parseBulkData, type BulkConnections } from "@/lib/editor/bulkCreate";

export function BulkCreatePanel() {
  const { t } = useTranslation();
  const clips = useEditorStore(s => s.clips), settings = useEditorStore(s => s.settings), time = useEditorStore(s => s.currentTime);
  const projectId = useEditorStore(s => s.projectId);
  const [source, setSource] = useState("Name,Role\nAlex,Designer\nSam,Producer");
  const [rowFilter, setRowFilter] = useState<BulkRowFilter>({});
  const [pageFields, setPageFields] = useState<BulkPageFields>({});
  const [imageConnections, setImageConnections] = useState<BulkConnections>({});
  const [linkConnections, setLinkConnections] = useState<BulkConnections>({});
  const [connections, setConnections] = useState<BulkConnections>({});
  const [first, setFirst] = useState("1"), [last, setLast] = useState("");
  const [rowIndex, setRowIndex] = useState(0), [fieldPage, setFieldPage] = useState(0);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ id: number; projectId: string; source: string; name: string } | null>(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setPendingImport(null); return () => { request.current++; }; }, [projectId]);
  const parsed = useMemo(() => { try { return { data: parseBulkData(source), error: "" }; } catch (value) { return { data: null, error: value instanceof Error ? value.message : "Invalid spreadsheet data" }; } }, [source]);
  const imageFields = useMemo(() => bulkImageFields({ ...useEditorStore.getState().toSnapshot(), clips, settings }, time), [clips, settings, time]);
  const photoNames = useMemo(() => bulkPhotoNames({ ...useEditorStore.getState().toSnapshot(), clips, settings }), [clips, settings]);
  const linkFields = useMemo(() => bulkLinkFields({ ...useEditorStore.getState().toSnapshot(), clips, settings }, time), [clips, settings, time]);
  const fields = useMemo(() => bulkTemplateFields({ ...useEditorStore.getState().toSnapshot(), clips, settings }, time), [clips, settings, time]);
  const data = parsed.data, connected = data ? fields.filter(clip => bulkConnected(clip, data.headers, connections)) : [];
  const previewRow = data?.rows[Math.min(rowIndex, data.rows.length - 1)], end = Number(last || data?.rows.length || 0);
  const selectedRows = useMemo(() => { try { return data ? bulkSelectedRows(data, Number(first), end, rowFilter) : []; } catch { return []; } }, [data, first, end, rowFilter]);
  const previewIncluded = selectedRows.includes(Math.min(rowIndex, (data?.rows.length ?? 1) - 1));
  const pagePreviewOptions = useMemo(() => data ? { data, row: Math.min(rowIndex, (data?.rows.length ?? 1) - 1), time, connections, pageFields, linkConnections, imageConnections } : null, [data, rowIndex, time, connections, pageFields, linkConnections, imageConnections]);
  const connectionContext = useMemo(() => data ? { headers: data.headers, fields, images: imageFields, links: linkFields, connections, imageConnections, linkConnections, pageFields } : null, [data, fields, imageFields, linkFields, connections, imageConnections, linkConnections, pageFields]);
  const changeSource = (value: string) => { request.current++; setPendingImport(null); setFirst("1"); setSource(value); setMessage(""); setError(""); setRowIndex(0); setLast(""); setRowFilter({}); };
  const importFile = async (file: File) => {
    const token = ++request.current;
    try {
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Choose a CSV or TSV file");
      if (file.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await file.text();
      if (token === request.current && useEditorStore.getState().projectId === projectId) { setPendingImport({ id: token, projectId, source: text, name: file.name }); setError(""); }
    } catch (value) { if (token === request.current) setError(value instanceof Error ? value.message : "Could not read this file"); }
  };
  const generate = () => {
    try {
      if (!data) return;
      const store = useEditorStore.getState(), before = store.toSnapshot();
      if (before.id !== projectId) return;
      const result = createBulkPages(before, store.currentTime, data, connections, Number(first), end, () => nanoid(10), pageFields, rowFilter, linkConnections, imageConnections, store.media);
      if (store.applyDesignEdit(before, result.project)) {
        store.setIsPlaying(false); store.setCurrentTime(result.start + 0.01); store.selectClip(null);
        setMessage(t("editor.bulk.created", { defaultValue: "Created {{count}} pages. Undo restores the original design.", count: result.count })); setError("");
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Could not generate pages"); }
  };
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white disabled:opacity-35";
  const page = Math.min(fieldPage, Math.max(0, Math.ceil(fields.length / 8) - 1));
  return <div className="space-y-3">
    <p className="text-xs text-white/60">{t("editor.bulk.hint", { defaultValue: "Use the current page as a template. Connect text and QR layers to spreadsheet columns, or put column names in double braces inside your text. Each selected row creates a new page; the original stays in place." })}</p>
    <div className="flex flex-wrap items-center gap-3"><label className={`${button} inline-flex cursor-pointer items-center`}>{t("editor.bulk.import", { defaultValue: "Import CSV or TSV" })}<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ""; }} /></label><span className="text-xs text-white/45">{t("editor.bulk.limits", { defaultValue: "Up to 50 rows and 20 columns" })}</span></div>
    <PasteDataImportControls bulk key={projectId} onPrepare={value => { const id = ++request.current; setPendingImport({ id, projectId: projectId, source: value, name: t("editor.dataImport.pastedName", { defaultValue: "pasted spreadsheet" }) }); setError(""); }} />
    {pendingImport && pendingImport.projectId === projectId && <DataImportMappingControls key={pendingImport.id} source={pendingImport.source} name={pendingImport.name} mode="bulk" defaultMultiple={false} defaultHeader onUse={result => { if (pendingImport.projectId === projectId) changeSource(result.source); }} onCancel={() => setPendingImport(null)} />}
    <textarea value={source} onChange={e => { request.current++; changeSource(e.target.value); }} maxLength={500000} rows={4} aria-label={t("editor.bulk.data", { defaultValue: "Spreadsheet data with column headers" })} className="w-full rounded-lg border border-white/20 bg-white/5 p-2 font-mono text-xs text-white" />
    {data && <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/65"><span>{data.rows.length} {t("editor.bulk.rows", { defaultValue: "data rows" })}</span><label>{t("editor.bulk.first", { defaultValue: "From row" })}<input type="number" min={1} max={data.rows.length} value={first} onChange={e => setFirst(e.target.value)} className="ml-2 min-h-9 w-16 rounded border border-white/20 bg-white/5 px-2" /></label><label>{t("editor.bulk.last", { defaultValue: "To row" })}<input type="number" min={1} max={data.rows.length} value={last || data.rows.length} onChange={e => setLast(e.target.value)} className="ml-2 min-h-9 w-16 rounded border border-white/20 bg-white/5 px-2" /></label></div>
      <BulkDataExportControls key={projectId} source={source} first={Number(first)} last={end} filter={rowFilter} title={useEditorStore.getState().projectTitle} count={selectedRows.length} />
      {connectionContext && <BulkConnectionFileControls key={projectId} context={connectionContext} title={useEditorStore.getState().projectTitle} onApply={value => { setConnections(value.connections); setImageConnections(value.imageConnections); setLinkConnections(value.linkConnections); setPageFields(value.pageFields); setMessage(""); setError(""); }} />}
      <BulkAutoConnectControls headers={data.headers} fields={fields} images={imageFields} connections={connections} imageConnections={imageConnections} onApply={value => { setConnections(value.connections); setImageConnections(value.images); setMessage(""); setError(""); }} />
      <BulkPlaceholderControls headers={data.headers} row={previewRow} />
      <BulkRowFilterControls headers={data.headers} value={rowFilter} onChange={value => { setRowFilter(value); setMessage(""); }} />
      <BulkPhotoConnectionsControls fields={imageFields} headers={data.headers} row={previewRow} value={imageConnections} onChange={value => { setImageConnections(value); setMessage(""); }} />
      <BulkPhotoNames names={photoNames} />
      <BulkLinkConnectionsControls fields={linkFields} headers={data.headers} row={previewRow} value={linkConnections} onChange={value => { setLinkConnections(value); setMessage(""); }} />
      <BulkPageFieldsControls headers={data.headers} row={previewRow} value={pageFields} onChange={value => { setPageFields(value); setMessage(""); }} />
      {!fields.length && <p className="text-xs text-white/60">{t("editor.bulk.noText", { defaultValue: "Add an unlocked text or QR layer to this page to connect your data." })}</p>}
      {fields.slice(page * 8, page * 8 + 8).map(clip => <div key={clip.id} className="grid gap-2 rounded-lg border border-white/10 p-2 sm:grid-cols-2"><span className="truncate text-xs text-white/80" title={bulkFieldText(clip)}>{clip.label || (clip.kind === "shape" ? "QR: " + bulkFieldText(clip) : bulkFieldText(clip)) || t("editor.bulk.emptyText", { defaultValue: "Empty text layer" })}</span><select aria-label={t("editor.bulk.connect", { defaultValue: "Connect {{name}} to a column", name: clip.label || bulkFieldText(clip).slice(0, 60) })} value={connections[clip.id] ?? ""} onChange={e => { setConnections(value => ({ ...value, [clip.id]: e.target.value })); setMessage(""); }} className="min-h-9 rounded border border-white/20 bg-neutral-900 px-2 text-xs text-white"><option value="">{t("editor.bulk.placeholders", { defaultValue: "Use placeholders in text" })}</option>{data.headers.map(header => <option key={header} value={header}>{header}</option>)}</select>{previewRow && <p className="whitespace-pre-wrap break-words text-xs text-white/50 sm:col-span-2">{bulkTextPreviewValue(clip, data.headers, previewRow, connections).slice(0, 500)}</p>}</div>)}
      {fields.length > 8 && <div className="flex items-center gap-2"><button type="button" className={button} disabled={page === 0} onClick={() => setFieldPage(page - 1)}>{t("editor.bulk.previousLayers", { defaultValue: "Previous layers" })}</button><span className="text-xs text-white/50">{page + 1} / {Math.ceil(fields.length / 8)}</span><button type="button" className={button} disabled={(page + 1) * 8 >= fields.length} onClick={() => setFieldPage(page + 1)}>{t("editor.bulk.nextLayers", { defaultValue: "Next layers" })}</button></div>}
      <div className="flex flex-wrap items-center gap-2"><p role="status" className={`text-xs ${previewIncluded ? "text-emerald-200" : "text-amber-200"}`}>{t(previewIncluded ? "editor.bulk.previewIncluded" : "editor.bulk.previewExcluded", { defaultValue: previewIncluded ? "This preview row is included in the batch." : "This preview row is outside the chosen range or filter." })}</p>{!previewIncluded && selectedRows.length > 0 && <button type="button" onClick={() => setRowIndex(selectedRows[0])} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/65">{t("editor.bulk.firstMatchingRecord", { defaultValue: "Preview first matching record" })}</button>}</div>
      <label className="block text-xs text-white/60">{t("editor.bulk.preview", { defaultValue: "Preview data row" })}<select value={Math.min(rowIndex, data.rows.length - 1)} onChange={e => setRowIndex(Number(e.target.value))} className="ml-2 min-h-9 rounded border border-white/20 bg-neutral-900 px-2 text-white">{data.rows.map((row, index) => <option key={index} value={index}>{index + 1} · {(row[0] || "—").slice(0, 60)}</option>)}</select></label>
      {pagePreviewOptions && <BulkPagePreview key={projectId} options={pagePreviewOptions} />}
      <button type="button" disabled={!bulkSelectedCount(data, Number(first), end, rowFilter) || (!connected.length && !bulkPageFieldsConnected(data.headers, pageFields) && !linkFields.some(clip => data.headers.includes(linkConnections[clip.id])) && !imageFields.some(clip => data.headers.includes(imageConnections[clip.id]))) || !Number.isInteger(Number(first)) || Number(first) < 1 || !Number.isInteger(end) || end < Number(first) || end > data.rows.length} onClick={generate} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.bulk.generate", { defaultValue: "Generate {{count}} pages", count: bulkSelectedCount(data, Number(first), end, rowFilter) })}</button>
    </>}
    {(parsed.error || error) && <p role="alert" className="text-xs text-red-300">{error || parsed.error}</p>}
    {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
  </div>;
}
