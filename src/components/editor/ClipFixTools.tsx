import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { detachAudio, letterboxCrop } from "@/lib/editor/clipTools";
import { sampleVideoFrames } from "@/lib/editor/clipToolsRuntime";
import type { MediaClip } from "@/lib/editor/types";

/** Detach audio and remove black bars for the selected video clip. */
export function ClipFixTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const silent = (clip.audio?.volume ?? 1) <= 0;

  const detach = () => {
    const store = useEditorStore.getState(), before = store.toSnapshot();
    const result = detachAudio(before, clip.id, () => nanoid(8));
    if (result && store.applyDesignEdit(before, result.project)) { store.selectClip(result.id); toast.success(t("editor.clipFix.detached")); }
    else toast.error(t("editor.clipFix.detachFailed"));
  };

  const removeBars = async () => {
    const store = useEditorStore.getState(), source = store.media.find(m => m.id === clip.mediaId);
    if (!source) return;
    setBusy(true);
    try {
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1, span = clip.duration * speed;
      const frames = await sampleVideoFrames(source.url, [0.2, 0.5, 0.8].map(f => clip.trimIn + span * f));
      const crop = letterboxCrop(frames);
      if (!crop) { toast.message(t("editor.clipFix.noBars")); return; }
      const now = useEditorStore.getState(), before = now.toSnapshot();
      const after = { ...before, clips: before.clips.map(c => c.id === clip.id ? { ...c, crop } as MediaClip : c) };
      if (now.applyDesignEdit(before, after)) toast.success(t("editor.clipFix.barsRemoved"));
    } catch (error) {
      console.warn("[editor] black bar detection failed", error);
      toast.error(t("editor.clipFix.barsFailed"));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 pt-2">
      <Button size="sm" variant="ghost" disabled={clip.locked || silent} onClick={detach}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {t("editor.clipFix.detach")}
      </Button>
      <Button size="sm" variant="ghost" disabled={clip.locked || busy} onClick={() => void removeBars()}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {busy ? t("editor.clipFix.scanning") : t("editor.clipFix.removeBars")}
      </Button>
    </div>
  );
}
