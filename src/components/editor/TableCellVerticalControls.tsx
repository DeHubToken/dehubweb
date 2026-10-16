import { useTranslation } from "react-i18next";
export function TableCellVerticalControls({ value, onApply }: { value?: "top" | "middle" | "bottom"; onApply: (value?: "top" | "middle" | "bottom") => void }) {
  const { t } = useTranslation();
  return <div className="space-y-1"><p className="text-xs text-white/65">{t("editor.tables.cellVertical", { defaultValue: "Selected cell vertical alignment" })}</p><div className="flex flex-wrap gap-2">{(["top", "middle", "bottom", "default"] as const).map(align => <button key={align} type="button" aria-pressed={value === (align === "default" ? undefined : align)} onClick={() => onApply(align === "default" ? undefined : align)} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t(`editor.tables.cellVertical.${align}`, { defaultValue: ({ top: "Top", middle: "Middle", bottom: "Bottom", default: "Use table alignment" })[align] })}</button>)}</div></div>;
}
