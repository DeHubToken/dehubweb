import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { videoDownloadFailure } from "@/lib/editor/videoDownloadFailure";
import type { VideoDownloadRequest } from "@/lib/editor/downloadProject";

let active: AbortController | null = null;
export function useVideoDownload() {
  const { t } = useTranslation();
  return useCallback(async (request: VideoDownloadRequest) => {
    if (active) return;
    const controller = new AbortController();
    active = controller;
    const id = "branded-video-download";
    const terminal = { id, action: undefined, duration: 6000 };
    const finish = () => { if (active === controller) active = null; };
    let lastProgress = 0, lastStage = "Preparing";
    const progress = (fraction: number, label?: string) => {
      if (active !== controller || controller.signal.aborted) return;
      lastProgress = fraction; lastStage = label || lastStage;
      return toast.loading(
        t("editor.export.preparing") + " " + Math.round(fraction * 100) + "%",
        { id, duration: Infinity, action: { label: t("common.cancel"), onClick: () => { if (active === controller) controller.abort(); } } },
      );
    };
    progress(0);
    try {
      const { renderVideoDownload } = await import("@/lib/editor/downloadVideo");
      const out = await renderVideoDownload(request, controller.signal, progress);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url; a.download = out.filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      finish();
      toast.success(t("editor.export.done", { filename: out.filename }), terminal);
    } catch (error) {
      finish();
      if (controller.signal.aborted || (error as Error).name === "AbortError") toast.info(t("editor.export.cancelled"), terminal);
      else {
        console.warn("[Video download] Failed", videoDownloadFailure(error, { stage: lastStage, progress: lastProgress }));
        toast.error(t("editor.export.failed"), terminal);
      }
    } finally { finish(); }
  }, [t]);
}
