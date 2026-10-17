import { useState } from "react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { detachPhotoBackground, setPhotoBackground } from "@/lib/editor/photoBackground";

export function PhotoBackgroundControls() {
  const { t } = useTranslation();
  const ids = useEditorStore(store => store.selectedClipIds), clips = useEditorStore(store => store.clips);
  const photo = clips.find(clip => ids.length === 1 && clip.id === ids[0] && clip.kind === "image");
  const [error, setError] = useState("");
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <p className="text-xs text-white/60">{t("editor.photoBackground.hint", { defaultValue: "Select a photo to use behind this page. Double-click the background to reframe it, or detach it as a movable layer." })}</p>
    <button type="button" disabled={!photo || photo.locked} onClick={() => {
      const store = useEditorStore.getState(), before = store.toSnapshot(), current = before.clips.find(clip => clip.id === photo?.id);
      if (current?.kind !== "image") return;
      const source = store.media.find(item => item.id === current.mediaId);
      const result = current.isPageBackground ? detachPhotoBackground(before, current.id, () => nanoid(10)) : setPhotoBackground(before, store.currentTime, current.id, source ?? null, () => nanoid(10));
      if (result && store.applyDesignEdit(before, result.project)) { store.selectClip(result.id); setError(""); }
      else setError(t("editor.photoBackground.unavailable", { defaultValue: "The photo could not be changed. Check locked backgrounds and the design’s layer limit." }));
    }} className="min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white disabled:opacity-35">{t(photo?.isPageBackground ? "editor.photoBackground.detach" : "editor.photoBackground.use", { defaultValue: photo?.isPageBackground ? "Detach background as photo" : "Use selected photo as background" })}</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
