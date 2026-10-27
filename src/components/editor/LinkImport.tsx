import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useEditorQuota } from "@/hooks/use-editor-quota";
import { useEditorStore } from "@/store/editorStore";
import { importOneFile } from "@/lib/editor/importFiles";
import { downloadEditorImport, getYoutubeImportStatus, importFromYoutube } from "@/lib/api/dehub/youtube-import";
import { editorErrorText } from "@/lib/editor/editorErrorText";
import { linkImportProgress } from "@/lib/editor/linkImport";

const POLL_MS = 2500;

/** Paste a YouTube, TikTok or other link and the clip lands in Media and on the timeline. */
export function LinkImport() {
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [owned, setOwned] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const busy = status !== null;

  const start = async () => {
    const link = url.trim();
    if (!link || !owned || busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setStatus(t("editor.linkImport.queued"));
    try {
      const { jobId } = await importFromYoutube({ url: link, ownershipConfirmed: true, destination: "editor", mediaKind: audioOnly ? "audio" : "video" });
      for (;;) {
        await new Promise(r => setTimeout(r, POLL_MS));
        if (controller.signal.aborted) return;
        const job = await getYoutubeImportStatus(jobId);
        const progress = linkImportProgress(job);
        if (progress.kind === "failed") throw new Error(job.failedReason || t("editor.linkImport.failed"));
        if (progress.kind === "done") {
          setStatus(t("editor.linkImport.adding"));
          const file = await downloadEditorImport(jobId, job.result?.editorFile?.fileName, controller.signal);
          const at = useEditorStore.getState().currentTime;
          const id = await importOneFile(file, { wallet: quota.walletAddress, badgeBalance: quota.badgeBalance, username: quota.username, signal: controller.signal });
          if (id) {
            useEditorStore.getState().addClipFromMedia(id, undefined, at);
            await quota.refetchUsage();
            window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
            toast.success(t("editor.linkImport.added"));
            setUrl(""); setOpen(false);
          }
          return;
        }
        setStatus(progress.kind === "waiting" ? t("editor.linkImport.waiting") : t("editor.linkImport.downloading", { percent: progress.percent }));
      }
    } catch (error) {
      if (!controller.signal.aborted) toast.error(editorErrorText(error, t("editor.linkImport.failed")));
    } finally {
      if (abort.current === controller) abort.current = null;
      setStatus(null);
    }
  };

  if (!quota.isAuthenticated) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={quota.overQuota}
        className="mx-3 mb-2 flex min-h-9 w-[calc(100%-1.5rem)] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40">
        {t("editor.linkImport.open")}
      </button>
    );
  }
  return (
    <div className="mx-3 mb-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5" data-link-import>
      <Input value={url} onChange={e => setUrl(e.target.value)} disabled={busy} inputMode="url" autoFocus
        placeholder={t("editor.linkImport.placeholder")} aria-label={t("editor.linkImport.placeholder")}
        onKeyDown={e => { if (e.key === "Enter") void start(); }}
        className="h-9 border-white/15 bg-black/40 text-[13px] text-white" />
      <label className="flex items-start gap-2 text-[11px] leading-snug text-white/70">
        <input type="checkbox" checked={owned} onChange={e => setOwned(e.target.checked)} disabled={busy} className="mt-0.5" />
        {t("editor.linkImport.rights")}
      </label>
      <label className="flex items-center gap-2 text-[11px] text-white/70">
        <input type="checkbox" checked={audioOnly} onChange={e => setAudioOnly(e.target.checked)} disabled={busy} />
        {t("editor.linkImport.audioOnly")}
      </label>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => { abort.current?.abort(); setOpen(false); }}
          className="min-h-9 flex-1 rounded-lg border border-white/15 text-xs text-white/75 hover:bg-white/10">{t("common.cancel")}</button>
        <button type="button" onClick={() => void start()} disabled={!url.trim() || !owned || busy}
          className="inline-flex min-h-9 flex-[2] items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-semibold text-black disabled:opacity-40">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{status ?? t("editor.linkImport.go")}
        </button>
      </div>
    </div>
  );
}
