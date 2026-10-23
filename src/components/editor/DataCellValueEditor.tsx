import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adjacentDataCell, dataCellPosition } from "@/lib/editor/dataCellAddress";

export function DataCellValueEditor({ address, value, rows, columns, onNavigate, onChange }: { address: string; value: string; rows: number; columns: number; onNavigate: (address: string) => void; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(address), [error, setError] = useState("");
  useEffect(() => { setTarget(address); setError(""); }, [address]);
  const move = () => {
    const normalized = target.trim().toUpperCase();
    if (!dataCellPosition(normalized, rows, columns)) { setError(t("editor.dataCells.invalidAddress", { defaultValue: "Choose an existing cell between A1 and {{last}}", last: `${String.fromCharCode(64 + columns)}${rows}` })); return; }
    setError(""); onNavigate(normalized);
  };
  const previous = adjacentDataCell(address, rows, columns, -1), next = adjacentDataCell(address, rows, columns, 1);
  return <div className="space-y-2 rounded-lg border border-white/15 bg-white/[0.03] p-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-white/65">{t("editor.dataCells.goTo", { defaultValue: "Go to cell" })}<input value={target} maxLength={3} onChange={event => { setTarget(event.target.value.toUpperCase()); setError(""); }} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); move(); } }} className="ml-2 min-h-9 w-16 rounded-md border border-white/20 bg-transparent px-2 font-mono text-xs uppercase" /></label>
      <button type="button" onClick={move} className="min-h-9 rounded-md border border-white/20 px-3 text-xs text-white/75">{t("editor.dataCells.go", { defaultValue: "Go" })}</button>
      {([{ label: t("editor.dataCells.previousCell", { defaultValue: "Previous cell" }), destination: previous }, { label: t("editor.dataCells.nextCell", { defaultValue: "Next cell" }), destination: next }]).map(item => <button key={item.label} type="button" disabled={!item.destination} onClick={() => { if (item.destination) onNavigate(item.destination); }} className="min-h-9 rounded-md border border-white/20 px-2 text-xs text-white/65 disabled:opacity-35">{item.label}</button>)}
    </div>
    <label className="block space-y-1 text-xs text-white/65"><span>{t("editor.dataCells.editCell", { defaultValue: "Edit {{address}}", address })}</span><textarea value={value} rows={2} maxLength={200} spellCheck={false} onChange={event => onChange(event.target.value)} className="w-full resize-y rounded-md border border-white/20 bg-transparent p-2 text-xs text-white outline-none focus:border-white/60" /></label>
    <p className="text-[10px] text-white/40">{t("editor.dataCells.valueHint", { defaultValue: "Edit the whole cell here, including line breaks. Values are stored as text; formulas are not calculated." })} {value.length}/200</p>
    {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
  </div>;
}
