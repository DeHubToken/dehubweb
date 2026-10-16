import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseTableData, type TableData } from "@/lib/editor/dataVisuals";
import { editTableStructure, type TableAxis, type TableStructureAction } from "@/lib/editor/tableStructure";

export function TableStructureControls({ value, source, onChange, onSource }: {
  value: Omit<TableData, "rows">; source: string; onChange: (value: Omit<TableData, "rows">) => void; onSource: (source: string) => void;
}) {
  const { t } = useTranslation();
  const [axis, setAxis] = useState<TableAxis>("row"), [index, setIndex] = useState(0), [error, setError] = useState("");
  const dimensions = useMemo(() => { try { const rows = parseTableData(source); return { row: rows.length, column: Math.max(0, ...rows.map(row => row.length)) }; } catch { return { row: 0, column: 0 }; } }, [source]);
  const total = dimensions[axis], selected = Math.min(index, Math.max(0, total - 1));
  const labels = { before: axis === "row" ? "Insert above" : "Insert left", after: axis === "row" ? "Insert below" : "Insert right", duplicate: "Duplicate", delete: "Delete", earlier: axis === "row" ? "Move up" : "Move left", later: axis === "row" ? "Move down" : "Move right" };
  const disabled = (action: TableStructureAction) => !total || (["before", "after", "duplicate"].includes(action) && total >= (axis === "row" ? 20 : 12)) || action === "delete" && total <= 1 || action === "earlier" && selected === 0 || action === "later" && selected === total - 1;
  const change = (action: TableStructureAction) => {
    try { const next = editTableStructure(source, value, axis, selected, action); onChange(next.format); onSource(next.source); setIndex(next.selected); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change this table"); }
  };
  return <div className="space-y-2 border-t border-white/10 pt-3">
    <p className="text-xs font-medium text-white/80">{t("editor.tables.structure", { defaultValue: "Rows and columns" })}</p>
    <div className="flex flex-wrap items-center gap-2">{(["row", "column"] as const).map(key => <button type="button" key={key} aria-pressed={axis === key} onClick={() => { setAxis(key); setIndex(0); setError(""); }} className={`min-h-9 rounded-lg border px-3 text-xs ${axis === key ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/20 text-white/65"}`}>{t(`editor.tables.axis.${key}`, { defaultValue: key === "row" ? "Row" : "Column" })}</button>)}<select aria-label={t("editor.tables.structureTarget", { defaultValue: "Row or column to edit" })} value={selected} onChange={event => setIndex(Number(event.target.value))} className="min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white">{Array.from({ length: total }, (_, index) => <option key={index} value={index}>{axis === "row" ? index + 1 : String.fromCharCode(65 + index)}</option>)}</select></div>
    <div className="flex flex-wrap gap-2">{(["before", "after", "duplicate", "earlier", "later", "delete"] as const).map(action => <button type="button" key={action} disabled={disabled(action)} onClick={() => change(action)} className={`min-h-9 rounded-lg border border-white/20 px-3 text-xs disabled:opacity-35 ${action === "delete" ? "text-red-300" : "text-white/75"}`}>{t(`editor.tables.structureAction.${axis}.${action}`, { defaultValue: labels[action] })}</button>)}</div>
    <p className="text-xs text-white/45">{t("editor.tables.structureHint", { defaultValue: "Cell formatting and relative sizes follow their rows and columns. The header stays on the first row." })}</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
