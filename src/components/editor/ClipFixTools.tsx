import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editorStore";
import { detachAudio, letterboxCrop } from "@/lib/editor/clipTools";
import { sampleVideoFrames } from "@/lib/editor/clipToolsRuntime";
import { reframeKeys, subjectCentres } from "@/lib/editor/reframe";
import { findRetakes, removeRetakes } from "@/lib/editor/retakes";
import { highlightCaptionWords, highlightSentences } from "@/lib/editor/highlights";
import { transcribeClipWords } from "@/lib/editor/captions";
import type { MediaClip } from "@/lib/editor/types";

/** Detach audio and remove black bars for the selected video clip. */
export function ClipFixTools({ clip }: { clip: MediaClip }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"" | "bars" | "reframe" | "retakes">("");
  const settings = useEditorStore(s => s.settings);
  const source = useEditorStore(s => s.media.find(m => m.id === clip.mediaId));
  const crop = clip.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const sourceAspect = source?.width && source.height ? (source.width * (1 - crop.left - crop.right)) / (source.height * (1 - crop.top - crop.bottom)) : 0;
  const overflow = sourceAspect && settings.height ? sourceAspect / (settings.width / settings.height) : 0;
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
    setBusy("bars");
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
    } finally { setBusy(""); }
  };

  const reframe = async () => {
    if (!source || overflow <= 1.05) return;
    setBusy("reframe");
    try {
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
      const count = Math.min(60, Math.max(4, Math.ceil(clip.duration / 0.5)));
      const times = Array.from({ length: count }, (_, i) => clip.duration * (i + 0.5) / count);
      const frames = await sampleVideoFrames(source.url, times.map(t => clip.trimIn + t * speed));
      const centres = subjectCentres(frames);
      const keys = reframeKeys(times.map((t, i) => ({ t, centre: centres[i] })), overflow);
      if (!keys.length) return;
      const now = useEditorStore.getState(), before = now.toSnapshot();
      const after = { ...before, clips: before.clips.map(c => c.id === clip.id && c.kind === "video" ? {
        ...c, fit: "cover" as const, transform: { y: 0.5, scale: 1, rotation: 0, ...c.transform, x: keys[0].v },
        keyframes: { ...c.keyframes, x: keys.length > 1 ? keys : undefined },
      } : c) };
      if (now.applyDesignEdit(before, after)) toast.success(t("editor.clipFix.reframed"));
    } catch (error) {
      console.warn("[editor] auto reframe failed", error);
      toast.error(t("editor.clipFix.reframeFailed"));
    } finally { setBusy(""); }
  };

  const retakes = async () => {
    if (!source) return;
    setBusy("retakes");
    try {
      const original = useEditorStore.getState().toSnapshot();
      const captioned = highlightCaptionWords(original, clip);
      const words = captioned.length ? captioned : await transcribeClipWords(clip, source.url, () => {});
      const cuts = findRetakes(highlightSentences(clip, words));
      if (!cuts.length) { toast.message(t("editor.clipFix.noRetakes")); return; }
      const now = useEditorStore.getState(), before = now.toSnapshot();
      const after = removeRetakes(before, clip.id, cuts, () => nanoid(8));
      if (after && now.applyDesignEdit(before, after)) toast.success(t("editor.clipFix.retakesRemoved", { count: cuts.length }));
      else toast.error(t("editor.clipFix.retakesFailed"));
    } catch (error) {
      console.warn("[editor] retake removal failed", error);
      toast.error(t("editor.clipFix.retakesFailed"));
    } finally { setBusy(""); }
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 pt-2">
      <Button size="sm" variant="ghost" disabled={clip.locked || silent} onClick={detach}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {t("editor.clipFix.detach")}
      </Button>
      <Button size="sm" variant="ghost" disabled={clip.locked || !!busy} onClick={() => void removeBars()}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {busy === "bars" ? t("editor.clipFix.scanning") : t("editor.clipFix.removeBars")}
      </Button>
      <Button size="sm" variant="ghost" disabled={clip.locked || !!busy || overflow <= 1.05} onClick={() => void reframe()}
        title={overflow <= 1.05 ? t("editor.clipFix.reframeHint") : undefined}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {busy === "reframe" ? t("editor.clipFix.scanning") : t("editor.clipFix.reframe")}
      </Button>
      <Button size="sm" variant="ghost" disabled={clip.locked || !!busy} onClick={() => void retakes()}
        className="h-7 rounded-md border border-white/10 text-[11px] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-40">
        {busy === "retakes" ? t("editor.clipFix.listening") : t("editor.clipFix.retakes")}
      </Button>
    </div>
  );
}
