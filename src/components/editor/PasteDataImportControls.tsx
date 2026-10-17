import { useState } from "react";
import { useTranslation } from "react-i18next";

export function PasteDataImportControls({ onPrepare, bulk = false }: { bulk?: boolean; onPrepare: (source: string) => void }) {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  return <details className="rounded-lg border border-white/10 p-3">
    <summary className="min-h-9 cursor-pointer text-xs font-semibold text-white/75">{t("editor.dataImport.paste", { defaultValue: "Paste spreadsheet data" })}</summary>
    <div className="space-y-3 pt-2">
      <textarea value={source} onChange={event => setSource(event.target.value)} maxLength={500000} rows={5} spellCheck={false} aria-label={t("editor.dataImport.pastedSource", { defaultValue: "Spreadsheet data to import" })} placeholder={"Category\tValue\nNorth\t42\nSouth\t58"} className="w-full rounded-lg border border-white/20 bg-white/5 p-3 font-mono text-xs text-white outline-none focus:border-white/60" />
      <p className="text-[10px] text-white/45">{t(bulk ? "editor.dataImport.bulkPasteHint" : "editor.dataImport.pasteHint", { defaultValue: bulk ? "Paste spreadsheet cells with column names in the first row. Choose columns and up to fifty records in the next step. Your current bulk data stays available until you use the selection." : "Paste cells copied from a spreadsheet, or CSV text. Choose columns, headings, number punctuation and a row window in the next step. Your current draft stays available until you use the selection." })}</p>
      <button type="button" disabled={!source.trim()} onClick={() => onPrepare(source)} className="min-h-10 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.dataImport.prepare", { defaultValue: "Choose data to use" })}</button>
    </div>
  </details>;
}
