import { DataCellValueEditor } from "./DataCellValueEditor";
import { dataCellAddress, dataCellPosition } from "@/lib/editor/dataCellAddress";
import type { TableAxis, TableStructureAction } from "@/lib/editor/tableStructure";
import { DataPastePanel } from "./DataPastePanel";
import { pasteDataCells } from "@/lib/editor/dataCellPaste";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDelimitedData, parseDelimitedData } from "@/lib/editor/delimitedData";

/** A compact spreadsheet view edits the same source data as CSV/TSV mode. */
export function DataCells({ value, onChange, chart, multiSeries = false, onCellFocus, onStructure, pageSize = 5 }: { value: string; onChange: (value: string) => void; chart: boolean; multiSeries?: boolean; onCellFocus?: (address: string) => void; onStructure?: (axis: TableAxis, index: number, action: TableStructureAction) => void; pageSize?: 5 | 10 | 20 }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0), [address, setAddress] = useState("A1"), [pasteError, setPasteError] = useState("");
  const inputRefs = useRef(new Map<string, HTMLInputElement>()), pendingFocus = useRef<{ row: number; column: number } | null>(null);
  const maxRows = chart ? multiSeries ? 51 : 50 : 20, maxColumns = chart ? multiSeries ? 7 : 2 : 12;
  const parsed = useMemo(() => { try { return { rows: parseDelimitedData(value, chart ? multiSeries ? 51 : 50 : 20, chart ? multiSeries ? 7 : 2 : 12), error: "" }; } catch (error) { return { rows: [], error: error instanceof Error ? error.message : "Invalid data" }; } }, [value, chart, multiSeries]);
  const rows = parsed.rows.length ? parsed.rows : [["", ""]];
  const columns = chart && !multiSeries ? 2 : Math.max(chart ? 2 : 1, ...rows.map(row => row.length));
  const activePosition = dataCellPosition(address, rows.length, columns) ?? { row: 0, column: 0 };
  const activeAddress = dataCellAddress(activePosition.row, activePosition.column);
  const editActiveValue = (text: string) => {
    onCellFocus?.(activeAddress);
    update(rows.map((row, index) => index === activePosition.row ? Array.from({ length: columns }, (_, column) => column === activePosition.column ? text.slice(0, 200) : row[column] ?? "") : row));
  };
  const start = Math.min(offset, Math.floor((rows.length - 1) / pageSize) * pageSize);
  const update = (next: string[][]) => onChange(formatDelimitedData(next, "\t"));
  useEffect(() => { const desired = pendingFocus.current; if (!desired) return; const element = inputRefs.current.get(`${desired.row}:${desired.column}`); if (element) { element.focus(); element.select(); pendingFocus.current = null; } }, [value, start, columns]);
  const focusCell = (row: number, column: number, grow: boolean) => {
    if (row < 0 || column < 0 || column >= columns || row >= maxRows || row >= rows.length && !grow) return false;
    if (row >= rows.length) { if (onStructure && parsed.rows.length && row === rows.length) onStructure("row", rows.length - 1, "after"); else update([...rows, ...Array.from({ length: row - rows.length + 1 }, () => Array(columns).fill(""))]); }
    pendingFocus.current = { row, column }; setOffset(Math.floor(row / pageSize) * pageSize);
    const element = inputRefs.current.get(`${row}:${column}`); if (element) { element.focus(); element.select(); pendingFocus.current = null; }
    return true;
  };
  const navigate = (target: string) => {
    const cell = dataCellPosition(target, rows.length, columns); if (!cell) return;
    setAddress(target); onCellFocus?.(target); focusCell(cell.row, cell.column, false);
  };
  const button = "min-h-8 rounded-lg border border-white/20 px-2 text-xs hover:bg-white/10 disabled:opacity-35";
  if (parsed.error) return <p className="text-xs text-amber-200">{parsed.error} {t("editor.dataVisual.fixSource", { defaultValue: "Use Source data to correct this input." })}</p>;
  return <div className="space-y-2">
    <DataCellValueEditor address={activeAddress} value={rows[activePosition.row]?.[activePosition.column] ?? ""} rows={rows.length} columns={columns} onNavigate={navigate} onChange={editActiveValue} />

    <div className="overflow-x-auto rounded-lg border border-white/20"><table className="w-full border-collapse text-xs"><thead><tr><th className="w-8 bg-white/5 p-1 text-white/40">#</th>{Array.from({ length: columns }, (_, c) => <th key={c} className="min-w-28 border-l border-white/10 bg-white/5 p-1 font-medium text-white/60">{chart && !multiSeries ? t(c === 0 ? "editor.dataVisual.label" : "editor.dataVisual.value", { defaultValue: c === 0 ? "Label" : "Value" }) : String.fromCharCode(65 + c)}</th>)}<th /></tr></thead><tbody>
      {rows.slice(start, start + pageSize).map((row, r) => <tr key={start + r}><td className="border-t border-white/10 p-1 text-center tabular-nums text-white/40">{start + r + 1}</td>{Array.from({ length: columns }, (_, c) => <td key={c} className="border-l border-t border-white/10"><input ref={element => { const key = `${start + r}:${c}`; if (element) inputRefs.current.set(key, element); else inputRefs.current.delete(key); }} onFocus={() => { const address = `${String.fromCharCode(65 + c)}${start + r + 1}`; setAddress(address); onCellFocus?.(address); }} onPaste={event => {
        const text = event.clipboardData.getData("text/plain"); if (!/[\t\r\n]/.test(text)) return;
        event.preventDefault(); try { const result = pasteDataCells(value, text, `${String.fromCharCode(65 + c)}${start + r + 1}`, maxRows, maxColumns); onChange(result.source); setPasteError(""); } catch (error) { setPasteError(error instanceof Error ? error.message : String(error)); }
      }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
        const rowIndex = start + r, input = event.currentTarget, collapsed = input.selectionStart === input.selectionEnd;
        let next: { row: number; column: number; grow: boolean } | null = null;
        if (event.key === "Enter") next = { row: rowIndex + (event.shiftKey ? -1 : 1), column: c, grow: !event.shiftKey };
        else if (event.key === "Tab") { const position = rowIndex * columns + c + (event.shiftKey ? -1 : 1); next = { row: Math.floor(position / columns), column: (position + columns) % columns, grow: !event.shiftKey }; }
        else if (!event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) next = { row: rowIndex + (event.key === "ArrowUp" ? -1 : 1), column: c, grow: false };
        else if (!event.shiftKey && event.key === "ArrowLeft" && collapsed && input.selectionStart === 0) next = { row: rowIndex, column: c - 1, grow: false };
        else if (!event.shiftKey && event.key === "ArrowRight" && collapsed && input.selectionEnd === input.value.length) next = { row: rowIndex, column: c + 1, grow: false };
        if (next && focusCell(next.row, next.column, next.grow)) { event.preventDefault(); event.stopPropagation(); }
      }} value={row[c] ?? ""} aria-label={t("editor.dataVisual.cell", { defaultValue: "Row {{row}}, column {{column}}", row: start + r + 1, column: c + 1 })} onChange={e => update(rows.map((cells, index) => index === start + r ? Array.from({ length: columns }, (_, col) => col === c ? e.target.value.slice(0, 200) : cells[col] ?? "") : cells))} className={`min-h-9 w-full min-w-28 px-2 outline-none focus:bg-white/10 ${activePosition.row === start + r && activePosition.column === c ? "bg-sky-300/10 ring-1 ring-inset ring-sky-300/50" : "bg-transparent"}`} maxLength={200} /></td>)}<td className="border-t border-white/10"><button type="button" disabled={!!onStructure && rows.length <= 1} className="px-2 text-white/50 hover:text-red-300 disabled:opacity-35" aria-label={t("editor.dataVisual.removeRow", { defaultValue: "Remove row {{row}}", row: start + r + 1 })} onClick={() => onStructure && parsed.rows.length ? onStructure("row", start + r, "delete") : update(rows.filter((_, index) => index !== start + r))}>×</button></td></tr>)}
    </tbody></table></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={rows.length >= (chart ? multiSeries ? 51 : 50 : 20)} onClick={() => { if (onStructure && parsed.rows.length) onStructure("row", rows.length - 1, "after"); else update([...rows, Array(columns).fill("")]); setOffset(Math.floor(rows.length / pageSize) * pageSize); }}>{t("editor.dataVisual.addRow", { defaultValue: "Add row" })}</button>{(!chart || multiSeries) && <><button type="button" className={button} disabled={columns >= (chart ? 7 : 12)} onClick={() => onStructure && parsed.rows.length ? onStructure("column", columns - 1, "after") : update(rows.map(row => [...Array.from({ length: columns }, (_, i) => row[i] ?? ""), ""]))}>{t("editor.dataVisual.addColumn", { defaultValue: "Add column" })}</button><button type="button" className={button} disabled={columns <= (chart ? 2 : 1)} onClick={() => onStructure && parsed.rows.length ? onStructure("column", columns - 1, "delete") : update(rows.map(row => row.slice(0, columns - 1)))}>{t("editor.dataVisual.removeColumn", { defaultValue: "Remove last column" })}</button></>}
      <button type="button" className={button} disabled={start === 0} onClick={() => setOffset(Math.max(0, start - pageSize))}>{t("editor.dataVisual.previousRows", { defaultValue: "Previous rows" })}</button><span className="text-xs tabular-nums text-white/50">{start + 1}–{Math.min(rows.length, start + pageSize)} / {rows.length}</span><button type="button" className={button} disabled={start + pageSize >= rows.length} onClick={() => setOffset(start + pageSize)}>{t("editor.dataVisual.nextRows", { defaultValue: "Next rows" })}</button>
    </div>
    <p className="text-xs text-white/40">{t("editor.dataCells.keyboardHint", { defaultValue: "Tab moves across cells; Enter moves down. Paste spreadsheet cells directly into the grid." })}</p>
    <DataPastePanel source={value} onChange={onChange} address={address} onAddress={setAddress} maxRows={maxRows} maxColumns={maxColumns} />
    {pasteError && <p role="alert" className="text-xs text-red-300">{pasteError}</p>}
  </div>;
}
