import { useState } from "react";
import { useTranslation } from "react-i18next";
import { qrSvgDocument } from "@/lib/editor/qrSvgDocument";
import type { QrGraphic } from "@/lib/editor/qrGraphic";
import { exportFilename } from "@/lib/editor/exportName";
export function QrVectorDownload({ value, title }: { value: QrGraphic | null; title: string }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const download = () => { if (!value) return; try { const url = URL.createObjectURL(new Blob([qrSvgDocument(value)], { type: "image/svg+xml;charset=utf-8" })), anchor = document.createElement("a"); try { anchor.href = url; anchor.download = exportFilename(title, "svg", "-qr", "qr-code"); anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); } setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not download QR code"); } };
  return <div className="space-y-1"><button type="button" disabled={!value} onClick={download} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35">{t("editor.qr.downloadSvg", { defaultValue: "Download QR as SVG" })}</button><p className="text-[10px] text-white/45">{t("editor.qr.vectorHint", { defaultValue: "Exports the current QR draft with its colours and quiet zone as scalable vector artwork." })}</p>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}</div>;
}
