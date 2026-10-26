import { useState } from "react";
import { useTranslation } from "react-i18next";
import { transposeChartSource } from "@/lib/editor/chartTranspose";
import { editorErrorText } from "@/lib/editor/editorErrorText";
export function ChartTransposeControl({ source, multiple, disabled = false, onChange }: { source: string; multiple: boolean; disabled?: boolean; onChange: (source: string) => void }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const apply = () => { try { const next = transposeChartSource(source, multiple); onChange(next); setError(""); } catch (reason) { setError(editorErrorText(reason, t("copy.67b748dae388", { defaultValue: "Could not switch chart data" }))); } };
  return <div className="space-y-1"><button type="button" disabled={disabled} onClick={apply} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 hover:bg-white/10 disabled:opacity-35">{t("editor.charts.transpose", { defaultValue: "Switch rows and columns" })}</button><p className="text-[10px] text-white/45">{disabled ? t("editor.charts.transposeScatter", { defaultValue: "Switch to a category chart to transpose data." }) : t("editor.charts.transposeHint", { defaultValue: "Up to six categories become series. Existing series become categories; palette order stays unchanged." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
