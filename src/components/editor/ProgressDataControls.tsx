import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseChartSource } from "@/lib/editor/chartSeries";
import { setProgressChartSource } from "@/lib/editor/progressChartSource";
export function ProgressDataControls({ source, multiple, onChange }: { source: string; multiple: boolean; onChange: (source: string) => void }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const value = useMemo(() => { try { return parseChartSource(source, multiple).rows[0]?.value ?? null; } catch { return null; } }, [source, multiple]);
  return <div className="space-y-2 rounded-lg border border-white/10 p-3"><label className="flex flex-wrap items-center gap-3 text-xs text-white/65">{t("editor.charts.progressPercentage", { defaultValue: "Progress percentage" })}<input type="range" min={0} max={100} step={0.1} disabled={value === null} value={Math.max(0, Math.min(100, value ?? 0))} onChange={event => { try { onChange(setProgressChartSource(source, multiple, Number(event.target.value))); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update progress"); } }} /><span>{value ?? "—"}%</span></label><p className="text-[10px] text-white/45">{t("editor.charts.progressDataHint", { defaultValue: "The first value is a percentage from 0 to 100, and its row label names the goal. The slider edits that source value. Other rows and series are retained in the data grid and CSV." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
