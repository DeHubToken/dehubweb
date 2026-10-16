import { useTranslation } from "react-i18next";
import { TableCellVerticalControls } from "./TableCellVerticalControls";
import { TableCellSizeControls } from "./TableCellSizeControls";
import type { TableCellStyle } from "@/lib/editor/tableCellStyles";
export function TableCellTypographyControls({ value, onApply }: { value: TableCellStyle; onApply: (patch: TableCellStyle) => void }) {
  const { t } = useTranslation();
  return <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-xs font-medium text-white/75">{t("editor.tables.cellTypography", { defaultValue: "Selected cell typography" })}</summary><div className="mt-3 space-y-3"><TableCellVerticalControls value={value.verticalAlign} onApply={verticalAlign => onApply({ verticalAlign })} /><TableCellSizeControls value={value.fontScale} onApply={fontScale => onApply({ fontScale })} /></div></details>;
}
