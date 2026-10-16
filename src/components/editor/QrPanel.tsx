import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { createQrGraphic, putQrGraphic } from "@/lib/editor/qrGraphic";

export function QrPanel() {
  const { t } = useTranslation();
  const selected = useEditorStore(s => s.clips.find(c => s.selectedClipIds.length === 1 && c.id === s.selectedClipIds[0]));
  const qr = selected?.kind === "shape" ? selected.qr : undefined;
  const [content, setContent] = useState("https://dehub.io");
  const [foreground, setForeground] = useState("#000000"), [background, setBackground] = useState("#ffffff");
  const [error, setError] = useState("");
  useEffect(() => { if (qr) { setContent(qr.content); setForeground(qr.foreground); setBackground(qr.background); } }, [selected?.id, qr]);
  const apply = () => {
    try {
      const store = useEditorStore.getState(), before = store.toSnapshot();
      const result = putQrGraphic(before, store.currentTime, createQrGraphic(content, foreground, background), () => nanoid(10), store.selectedClipIds.length === 1 ? store.selectedClipIds[0] : null);
      if (result && store.applyDesignEdit(before, result.project)) { store.selectClip(result.id); setError(""); }
    } catch { setError(t("editor.qr.failed", { defaultValue: "Use shorter text and two different hex colours." })); }
  };
  return <div className="space-y-3">
    <p className="text-xs text-white/60">{t("editor.qr.hint", { defaultValue: "Create a QR code for a link or text. Keep strong contrast between the foreground and background." })}</p>
    <textarea aria-label={t("editor.qr.content", { defaultValue: "Link or text" })} value={content} onChange={e => setContent(e.target.value)} maxLength={1500} rows={3} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/60" />
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2">{t("editor.qr.foreground", { defaultValue: "Foreground" })}<input type="color" value={foreground} onChange={e => setForeground(e.target.value)} className="h-9 w-10 bg-transparent" /></label>
      <label className="flex items-center gap-2">{t("editor.qr.background", { defaultValue: "Background" })}<input type="color" value={background} onChange={e => setBackground(e.target.value)} className="h-9 w-10 bg-transparent" /></label>
      <button type="button" disabled={!content.trim() || foreground === background || (!!qr && !!selected?.locked)} onClick={apply} className="min-h-9 rounded-lg bg-white px-3 font-medium text-black disabled:opacity-35">{t(qr ? "editor.qr.update" : "editor.qr.insert", { defaultValue: qr ? "Update QR code" : "Insert QR code" })}</button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  </div>;
}
