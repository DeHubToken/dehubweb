import { CropPrecisionControls } from "./CropPrecisionControls";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { CROP_ASPECTS, cropMediaToAspect, focusMediaCrop, mediaCropFocus } from "@/lib/editor/mediaCrop";
import type { MediaClip } from "@/lib/editor/types";

export function CropPresets({ clip, source }: { clip: MediaClip; source: { width: number; height: number } | null }) {
  const { t } = useTranslation();
  const page = useEditorStore(store => store.settings);
  const [focal, setFocal] = useState(() => mediaCropFocus(clip));
  useEffect(() => setFocal(mediaCropFocus(clip)), [clip.crop, clip.transform?.flipH, clip.transform?.flipV]);
  const focus = (x: number, y: number) => {
    setFocal({ x, y });
    const store = useEditorStore.getState(), current = store.clips.find(value => value.id === clip.id);
    if (!current || (current.kind !== "image" && current.kind !== "video")) return;
    const patch = focusMediaCrop(current, x, y); if (patch) store.patchClip(clip.id, patch);
  };
  return <div className="space-y-2">
    <button type="button" disabled={clip.locked} onClick={() => window.dispatchEvent(new CustomEvent("editor:crop-photo", { detail: { id: clip.id } }))} className="min-h-9 w-full rounded-lg border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10 disabled:opacity-35">{t("editor.crop.onCanvas", { defaultValue: "Crop on canvas" })}</button>
    <div className="flex flex-wrap gap-1">{CROP_ASPECTS.map(preset => <button type="button" key={preset.label} disabled={clip.locked || !source} onClick={() => {
      const store = useEditorStore.getState(), current = store.clips.find(value => value.id === clip.id);
      if (!source || !current || (current.kind !== "image" && current.kind !== "video")) return;
      const patch = cropMediaToAspect(current, store.settings, source, preset.ratio, focal.x, focal.y); if (patch) store.patchClip(clip.id, patch);
    }} className="min-h-8 rounded-lg border border-white/20 px-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-35">{preset.ratio ? preset.label : t("editor.crop.original", { defaultValue: "Original" })}</button>)}</div>
    <div className="flex items-center gap-3"><div className="grid w-24 grid-cols-3 gap-1" role="group" aria-label={t("editor.crop.focus", { defaultValue: "Crop focus" })}>{[0, 0.5, 1].flatMap(y => [0, 0.5, 1].map(x => <button type="button" key={`${x}:${y}`} disabled={clip.locked} aria-pressed={focal.x === x && focal.y === y} aria-label={t("editor.crop.focusPoint", { defaultValue: "Focus {{x}}%, {{y}}%", x: x * 100, y: y * 100 })} onClick={() => focus(x, y)} className={`h-7 rounded border ${focal.x === x && focal.y === y ? "border-white bg-white/30" : "border-white/15 bg-white/5"}`}><span aria-hidden>·</span></button>))}</div><span className="text-xs leading-snug text-white/45">{t("editor.crop.focusHint", { defaultValue: "Move the crop window while keeping its size." })}</span></div>
    <CropPrecisionControls key={clip.id} focal={focal} pageRatio={page.width / page.height} disabled={!!clip.locked || !source} onFocus={focus} onAspect={ratio => {
      const store = useEditorStore.getState(), current = store.clips.find(value => value.id === clip.id);
      if (!source || !current || (current.kind !== "image" && current.kind !== "video")) return false;
      const patch = cropMediaToAspect(current, store.settings, source, ratio, focal.x, focal.y); if (!patch) return false; store.patchClip(clip.id, patch); return true;
    }} />
  </div>;
}
