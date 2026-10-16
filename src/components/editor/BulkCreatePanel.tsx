import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { bulkConnected, bulkFieldText, bulkTemplateFields, bulkTextValue, createBulkPages, parseBulkData, type BulkConnections } from "@/lib/editor/bulkCreate";

export function BulkCreatePanel() {
  const { t } = useTranslation();
  const clips = useEditorStore(s => s.clips), settings = useEditorStore(s => s.settings), time = useEditorStore(s => s.currentTime);
  const projectId = useEditorStore(s => s.projectId);
  const [source, setSource] = useState("Name,Role\nAlex,Designer\nSam,Producer");
  const [connections, setConnections] = useState<BulkConnections>({});
  const [first, setFirst] = useState("1"), [last, setLast] = useState("");
  const [rowIndex, setRowIndex] = useState(0), [fieldPage, setFieldPage] = useState(0);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const parsed = useMemo(() => { try { return { data: parseBulkData(source), error: "" }; } catch (value) { return { data: null, error: value instanceof Error ? value.message : "Invalid spreadsheet data" }; } }, [source]);
  const fields = useMemo(() => bulkTemplateFields({ ...useEditorStore.getState().toSnapshot(), clips, settings }, time), [clips, settings, time]);
  const data = parsed.data, connected = data ? fields.filter(clip => bulkConnected(clip, data.headers, connections)) : [];
  const previewRow = data?.rows[Math.min(rowIndex, data.rows.length - 1)], end = Number(last || data?.rows.length || 0);
  const changeSource = (value: string) => { setSource(value); setMessage(""); setError(""); setRowIndex(0); setLast(""); };
  const importFile = async (file: File) => {
    const token = ++request.current;
    try {
      if (file.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await file.text();
      if (token === request.current && useEditorStore.getState().projectId === projectId) changeSource(text);
    } catch (value) { if (token === request.current) setError(value instanceof Error ? value.message : "Could not read this file"); }
  };
  const generate = () => {
    try {
      if (!data) return;
      const store = useEditorStore.getState(), before = store.toSnapshot();
      if (before.id !== projectId) return;
      const result = createBulkPages(before, store.currentTime, data, connections, Number(first), end, () => nanoid(10));
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
    <textarea value={source} onChange={e => { request.current++; changeSource(e.target.value); }} maxLength={500000} rows={4} aria-label={t("editor.bulk.data", { defaultValue: "Spreadsheet data with column headers" })} className="w-full rounded-lg border border-white/20 bg-white/5 p-2 font-mono text-xs text-white" />
    {data && <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/65"><span>{data.rows.length} {t("editor.bulk.rows", { defaultValue: "data rows" })}</span><label>{t("editor.bulk.first", { defaultValue: "From row" })}<input type="number" min={1} max={data.rows.length} value={first} onChange={e => setFirst(e.target.value)} className="ml-2 min-h-9 w-16 rounded border border-white/20 bg-white/5 px-2" /></label><label>{t("editor.bulk.last", { defaultValue: "To row" })}<input type="number" min={1} max={data.rows.length} value={last || data.rows.length} onChange={e => setLast(e.target.value)} className="ml-2 min-h-9 w-16 rounded border border-white/20 bg-white/5 px-2" /></label></div>
      {!fields.length && <p className="text-xs text-white/60">{t("editor.bulk.noText", { defaultValue: "Add an unlocked text or QR layer to this page to connect your data." })}</p>}
      {fields.slice(page * 8, page * 8 + 8).map(clip => <div key={clip.id} className="grid gap-2 rounded-lg border border-white/10 p-2 sm:grid-cols-2"><span className="truncate text-xs text-white/80" title={bulkFieldText(clip)}>{clip.label || (clip.kind === "shape" ? "QR: " + bulkFieldText(clip) : bulkFieldText(clip)) || t("editor.bulk.emptyText", { defaultValue: "Empty text layer" })}</span><select aria-label={t("editor.bulk.connect", { defaultValue: "Connect {{name}} to a column", name: clip.label || bulkFieldText(clip).slice(0, 60) })} value={connections[clip.id] ?? ""} onChange={e => { setConnections(value => ({ ...value, [clip.id]: e.target.value })); setMessage(""); }} className="min-h-9 rounded border border-white/20 bg-neutral-900 px-2 text-xs text-white"><option value="">{t("editor.bulk.placeholders", { defaultValue: "Use placeholders in text" })}</option>{data.headers.map(header => <option key={header} value={header}>{header}</option>)}</select>{previewRow && <p className="whitespace-pre-wrap break-words text-xs text-white/50 sm:col-span-2">{bulkTextValue(clip, data.headers, previewRow, connections).slice(0, 500)}</p>}</div>)}
      {fields.length > 8 && <div className="flex items-center gap-2"><button type="button" className={button} disabled={page === 0} onClick={() => setFieldPage(page - 1)}>{t("editor.bulk.previousLayers", { defaultValue: "Previous layers" })}</button><span className="text-xs text-white/50">{page + 1} / {Math.ceil(fields.length / 8)}</span><button type="button" className={button} disabled={(page + 1) * 8 >= fields.length} onClick={() => setFieldPage(page + 1)}>{t("editor.bulk.nextLayers", { defaultValue: "Next layers" })}</button></div>}
      <label className="block text-xs text-white/60">{t("editor.bulk.preview", { defaultValue: "Preview data row" })}<select value={Math.min(rowIndex, data.rows.length - 1)} onChange={e => setRowIndex(Number(e.target.value))} className="ml-2 min-h-9 rounded border border-white/20 bg-neutral-900 px-2 text-white">{data.rows.map((row, index) => <option key={index} value={index}>{index + 1} · {(row[0] || "—").slice(0, 60)}</option>)}</select></label>
      <button type="button" disabled={!connected.length || !Number.isInteger(Number(first)) || Number(first) < 1 || !Number.isInteger(end) || end < Number(first) || end > data.rows.length} onClick={generate} className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-35">{t("editor.bulk.generate", { defaultValue: "Generate {{count}} pages", count: Math.max(0, end - Number(first) + 1) || 0 })}</button>
    </>}
    {(parsed.error || error) && <p role="alert" className="text-xs text-red-300">{error || parsed.error}</p>}
    {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
  </div>;
}
