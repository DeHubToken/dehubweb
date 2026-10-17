import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
export function TableCellSizeControls({ value, onApply }: { value?: number; onApply: (value?: number) => void }) {
  const { t } = useTranslation(), [percent, setPercent] = useState(Math.round((value ?? 1) * 100));
  useEffect(() => { setPercent(Math.round((value ?? 1) * 100)); }, [value]);
  return <div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs text-white/65">{t("editor.tables.cellTextSize", { defaultValue: "Selected cell text size" })}<input type="range" min={50} max={300} step={5} value={percent} onChange={event => setPercent(Number(event.target.value))} /><span className="tabular-nums">{percent}%</span></label><button type="button" onClick={() => onApply(percent / 100)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.tables.applyCellTextSize", { defaultValue: "Apply text size" })}</button><button type="button" onClick={() => onApply(undefined)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.tables.defaultCellTextSize", { defaultValue: "Use table text size" })}</button></div>;
}
