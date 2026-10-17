import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addTableMerge, tableMergeLabel, type TableMerge } from "@/lib/editor/tableMerges";

export function TableMergeControls({ value, rows, columns, onChange }: { value?: TableMerge[]; rows: number; columns: number; onChange: (value: TableMerge[] | undefined) => void }) {
  const { t } = useTranslation(), [range, setRange] = useState("A1:B1"), [error, setError] = useState("");
  const button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div className="space-y-2 border-t border-white/10 pt-3"><div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/65">{t("editor.tables.mergeRange", { defaultValue: "Merge cells" })}<input value={range} onChange={event => { setRange(event.target.value); setError(""); }} maxLength={15} placeholder="A1:C2" aria-label={t("editor.tables.cellRange", { defaultValue: "Cell range, for example A1:C2" })} className="ml-2 min-h-9 w-28 rounded-lg border border-white/20 bg-neutral-900 px-3 text-xs text-white" /></label><button type="button" className={button} disabled={!rows || !columns} onClick={() => { try { onChange(addTableMerge(value, range, rows, columns)); setError(""); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } }}>{t("editor.tables.merge", { defaultValue: "Merge range" })}</button><button type="button" className={button} disabled={!value?.length} onClick={() => { onChange(undefined); setError(""); }}>{t("editor.tables.unmergeAll", { defaultValue: "Unmerge all" })}</button></div>
    <p className="text-xs text-white/45">{t("editor.tables.mergeHint", { defaultValue: "Merged cells display the top-left cell. Content in covered cells is kept and reappears when unmerged." })}</p>
    {!!value?.length && <div className="flex flex-wrap gap-2">{value.map((merge, index) => <button key={tableMergeLabel(merge)} type="button" className={button} aria-label={t("editor.tables.unmergeRange", { defaultValue: "Unmerge {{range}}", range: tableMergeLabel(merge) })} onClick={() => { onChange(value.filter((_, position) => position !== index)); setError(""); }}>{tableMergeLabel(merge)} ×</button>)}</div>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
