import { ensureGraphicFont } from "@/lib/editor/googleFonts";
import { useTranslation } from "react-i18next";
import { SvgArtworkDownload } from "./SvgArtworkDownload";
import { dataVisualSvgDocument, type SvgDataVisual } from "@/lib/editor/dataVisualSvg";
export function DataVisualVectorDownload({ value, width, height, title }: { projectId: string; value: SvgDataVisual | null; width: number; height: number; title: string }) {
  const { t } = useTranslation();
  const getSvg = async (signal: AbortSignal) => { if (!value) throw new Error("Enter valid data before exporting"); await ensureGraphicFont("chart" in value ? value.chart.fontFamily : value.table.fontFamily); if (signal.aborted) throw new Error("Vector export cancelled"); const context = document.createElement("canvas").getContext("2d"); if (!context) throw new Error("Text measurement is unavailable"); return dataVisualSvgDocument(value, Math.max(32, Math.min(8192, width)), Math.max(32, Math.min(8192, height)), (text, font) => { context.font = font; return context.measureText(text).width; }); };
  return <SvgArtworkDownload disabled={!value} getSvg={getSvg} title={title} suffix="-graphic" label={t("editor.dataVisual.downloadSvg", { defaultValue: "Download graphic as SVG" })} hint={t("editor.dataVisual.vectorHint", { defaultValue: "Exports this graphic on a transparent background. Text stays editable and uses the selected font where available." })} />;
}
