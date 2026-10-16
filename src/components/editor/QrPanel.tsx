import { QrBrandPalettes } from "./QrBrandPalettes";
import { QrContentBuilder } from "./QrContentBuilder";
import { QrVectorDownload } from "./QrVectorDownload";
import { useQrPreview } from "@/lib/editor/useQrPreview";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { QR_ERROR_CORRECTION, qrPreviewPath, putQrGraphic, type QrGraphic } from "@/lib/editor/qrGraphic";

export function QrPanel() {
  const { t } = useTranslation();
  const selected = useEditorStore(s => s.clips.find(c => s.selectedClipIds.length === 1 && c.id === s.selectedClipIds[0]));
  const qr = selected?.kind === "shape" ? selected.qr : undefined;
  const [content, setContent] = useState("https://dehub.io");
  const [foreground, setForeground] = useState("#000000"), [background, setBackground] = useState("#ffffff");
  const [correction, setCorrection] = useState<NonNullable<QrGraphic["errorCorrection"]>>("M"), [quietZone, setQuietZone] = useState(4);
  const preview = useQrPreview(content, foreground, background, correction, quietZone);
  const [error, setError] = useState(""), [draftEpoch, setDraftEpoch] = useState(0);
  const reset = () => { setContent(qr?.content ?? "https://dehub.io"); setForeground(qr?.foreground ?? "#000000"); setBackground(qr?.background ?? "#ffffff"); setCorrection(qr?.errorCorrection ?? "M"); setQuietZone(qr?.quietZone ?? 4); setError(""); setDraftEpoch(value => value + 1); };
  useEffect(() => { if (qr) { setContent(qr.content); setForeground(qr.foreground); setBackground(qr.background); setCorrection(qr.errorCorrection ?? "M"); setQuietZone(qr.quietZone ?? 4); } }, [selected?.id, qr]);
  const apply = () => {
    try {
      if (!preview.value) return;
      const store = useEditorStore.getState(), before = store.toSnapshot();
      const result = putQrGraphic(before, store.currentTime, preview.value, () => nanoid(10), store.selectedClipIds.length === 1 ? store.selectedClipIds[0] : null);
      if (result && store.applyDesignEdit(before, result.project)) { store.selectClip(result.id); setError(""); }
    } catch { setError(t("editor.qr.failed", { defaultValue: "Use shorter text and two different hex colours." })); }
  };
  return <div className="space-y-3">
    <div className="flex min-h-40 items-center justify-center">{preview.value ? <svg viewBox={`0 0 ${preview.value.cells.length + quietZone * 2} ${preview.value.cells.length + quietZone * 2}`} role="img" aria-label={t("editor.qr.preview", { defaultValue: "QR code preview" })} className="h-40 w-40" shapeRendering="crispEdges"><rect width="100%" height="100%" fill={preview.value.background} /><path d={qrPreviewPath(preview.value)} fill={preview.value.foreground} /></svg> : <p role="status" className="max-w-sm text-center text-xs text-white/50">{t(preview.pending ? "editor.qr.preparing" : "editor.qr.invalidPreview", { defaultValue: preview.pending ? "Preparing preview…" : "Use shorter text and two different hex colours, or choose a more compact correction level." })}</p>}</div>
    <QrVectorDownload value={preview.value} title={useEditorStore.getState().title} />
    <p className="text-xs text-white/60">{t("editor.qr.hint", { defaultValue: "Create a QR code for a link or text. Keep strong contrast between the foreground and background." })}</p>
    <QrBrandPalettes value={[foreground, background]} onChange={colours => { setForeground(colours[0]); setBackground(colours[1]); setError(""); }} />
    <QrContentBuilder key={`${selected?.id ?? "new"}:${draftEpoch}`} onUse={value => { setContent(value); setError(""); }} />
    <textarea aria-label={t("editor.qr.content", { defaultValue: "Link or text" })} value={content} onChange={e => setContent(e.target.value)} maxLength={1500} rows={3} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/60" />
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/65"><label>{t("editor.qr.correction", { defaultValue: "Error correction" })}<select value={correction} onChange={event => setCorrection(event.target.value as NonNullable<QrGraphic["errorCorrection"]>)} className="ml-2 min-h-9 rounded-lg border border-white/20 bg-neutral-900 px-2">{QR_ERROR_CORRECTION.map(level => <option key={level} value={level}>{t(`editor.qr.level.${level}`, { defaultValue: ({ L: "Compact (L)", M: "Balanced (M)", Q: "Robust (Q)", H: "Maximum correction (H)" })[level] })}</option>)}</select></label><label>{t("editor.qr.quietZone", { defaultValue: "Quiet zone (modules)" })}<input type="number" min={4} max={8} step={1} value={quietZone} onChange={event => setQuietZone(Math.max(4, Math.min(8, Math.round(Number(event.target.value) || 4))))} className="ml-2 min-h-9 w-16 rounded-lg border border-white/20 bg-white/5 px-2" /></label></div>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2">{t("editor.qr.foreground", { defaultValue: "Foreground" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-9 w-10 bg-transparent" /></label>
      <label className="flex items-center gap-2">{t("editor.qr.background", { defaultValue: "Background" })}<input type="color" value={background} onChange={e => setBackground(e.target.value)} className="h-9 w-10 bg-transparent" /></label>
      <button type="button" onClick={reset} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75">{t("editor.qr.resetDraft", { defaultValue: "Reset QR draft" })}</button>
      <button type="button" disabled={!preview.value || !content.trim() || foreground === background || (!!qr && !!selected?.locked)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(qr ? "editor.qr.update" : "editor.qr.insert", { defaultValue: qr ? "Update QR code" : "Insert QR code" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
