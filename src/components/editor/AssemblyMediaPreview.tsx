import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEditorStore } from "@/store/editorStore";
import type { MediaClip } from "@/lib/editor/types";

export default function AssemblyMediaPreview({ clip, onClose }: { clip: MediaClip | null; onClose: () => void }) {
  const { t } = useTranslation();
  const media = useEditorStore(state => state.media.find(item => item.id === clip?.mediaId));
  if (!clip) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="border-white/15 bg-black text-white sm:max-w-3xl" aria-describedby={undefined}>
      <DialogTitle>{t("editor.shots.preview")} · {media?.name ?? t("editor.video.video")}</DialogTitle>
      {!media?.url ? <p role="status">{t("common.somethingWentWrong")}</p> : clip.kind === "image"
        ? <img src={media.url} alt={media.name} className="mx-auto max-h-[60vh] max-w-full object-contain" />
        : <PreviewVideo clip={clip} url={media.url} />}
    </DialogContent>
  </Dialog>;
}

function PreviewVideo({ clip, url }: { clip: MediaClip; url: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    return () => { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } };
  }, [clip.id, url]);
  return <video ref={video} src={url} controls autoPlay playsInline className="max-h-[60vh] w-full"
    onLoadedMetadata={event => { event.currentTarget.currentTime = clip.trimIn; event.currentTarget.playbackRate = clip.speed ?? 1; }}
    onTimeUpdate={event => { if (event.currentTarget.currentTime >= clip.trimIn + clip.duration * (clip.speed ?? 1)) event.currentTarget.pause(); }} />;
}
