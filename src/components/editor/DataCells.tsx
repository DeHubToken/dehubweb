import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDelimitedData, parseDelimitedData } from "@/lib/editor/delimitedData";

/** A compact spreadsheet view edits the same source data as CSV/TSV mode. */
export function DataCells({ value, onChange, chart, multiSeries = false }: { value: string; onChange: (value: string) => void; chart: boolean; multiSeries?: boolean }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const parsed = useMemo(() => { try { return { rows: parseDelimitedData(value, chart ? multiSeries ? 51 : 50 : 20, chart ? multiSeries ? 7 : 2 : 12), error: "" }; } catch (error) { return { rows: [], error: error instanceof Error ? error.message : "Invalid data" }; } }, [value, chart, multiSeries]);
  const rows = parsed.rows.length ? parsed.rows : [["", ""]];
  const columns = chart && !multiSeries ? 2 : Math.max(chart ? 2 : 1, ...rows.map(row => row.length));
  const start = Math.min(offset, Math.floor((rows.length - 1) / 5) * 5);
  const update = (next: string[][]) => onChange(formatDelimitedData(next, "\t"));
  const button = "min-h-8 rounded-lg border border-white/20 px-2 text-xs hover:bg-white/10 disabled:opacity-35";
  if (parsed.error) return <p className="text-xs text-amber-200">{parsed.error} {t("editor.dataVisual.fixSource", { defaultValue: "Use Source data to correct this input." })}</p>;
  return <div className="space-y-2">
    <div className="overflow-x-auto rounded-lg border border-white/20"><table className="w-full border-collapse text-xs"><thead><tr><th className="w-8 bg-white/5 p-1 text-white/40">#</th>{Array.from({ length: columns }, (_, c) => <th key={c} className="min-w-28 border-l border-white/10 bg-white/5 p-1 font-medium text-white/60">{chart && !multiSeries ? t(c === 0 ? "editor.dataVisual.label" : "editor.dataVisual.value", { defaultValue: c === 0 ? "Label" : "Value" }) : String.fromCharCode(65 + c)}</th>)}<th /></tr></thead><tbody>
      {rows.slice(start, start + 5).map((row, r) => <tr key={start + r}><td className="border-t border-white/10 p-1 text-center tabular-nums text-white/40">{start + r + 1}</td>{Array.from({ length: columns }, (_, c) => <td key={c} className="border-l border-t border-white/10"><input value={row[c] ?? ""} aria-label={t("editor.dataVisual.cell", { defaultValue: "Row {{row}}, column {{column}}", row: start + r + 1, column: c + 1 })} onChange={e => update(rows.map((cells, index) => index === start + r ? Array.from({ length: columns }, (_, col) => col === c ? e.target.value.slice(0, 200) : cells[col] ?? "") : cells))} className="min-h-9 w-full min-w-28 bg-transparent px-2 outline-none focus:bg-white/10" maxLength={200} /></td>)}<td className="border-t border-white/10"><button type="button" className="px-2 text-white/50 hover:text-red-300" aria-label={t("editor.dataVisual.removeRow", { defaultValue: "Remove row {{row}}", row: start + r + 1 })} onClick={() => update(rows.filter((_, index) => index !== start + r))}>×</button></td></tr>)}
    </tbody></table></div>
    <div className="flex flex-wrap items-center gap-2"><button type="button" className={button} disabled={rows.length >= (chart ? multiSeries ? 51 : 50 : 20)} onClick={() => { update([...rows, Array(columns).fill("")]); setOffset(Math.floor(rows.length / 5) * 5); }}>{t("editor.dataVisual.addRow", { defaultValue: "Add row" })}</button>{(!chart || multiSeries) && <><button type="button" className={button} disabled={columns >= (chart ? 7 : 12)} onClick={() => update(rows.map(row => [...Array.from({ length: columns }, (_, i) => row[i] ?? ""), ""]))}>{t("editor.dataVisual.addColumn", { defaultValue: "Add column" })}</button><button type="button" className={button} disabled={columns <= (chart ? 2 : 1)} onClick={() => update(rows.map(row => row.slice(0, columns - 1)))}>{t("editor.dataVisual.removeColumn", { defaultValue: "Remove last column" })}</button></>}
      <button type="button" className={button} disabled={start === 0} onClick={() => setOffset(Math.max(0, start - 5))}>{t("editor.dataVisual.previousRows", { defaultValue: "Previous rows" })}</button><span className="text-xs tabular-nums text-white/50">{start + 1}–{Math.min(rows.length, start + 5)} / {rows.length}</span><button type="button" className={button} disabled={start + 5 >= rows.length} onClick={() => setOffset(start + 5)}>{t("editor.dataVisual.nextRows", { defaultValue: "Next rows" })}</button>
    </div>
  </div>;
}
