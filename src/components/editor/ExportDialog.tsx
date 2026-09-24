/**
 * Download dialog — video (MP4/WebM via WebCodecs) or a still image (PNG/JPG)
 * of the frame under the playhead. Photo and graphic projects, which have no
 * video or audio on the timeline, default to PNG.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { Download, X, Scissors } from "lucide-react";
import { toast } from "sonner";
import { useEditorStore, selectTimelineDuration } from "@/store/editorStore";
import { exportProject, exportStill, isExportSupported, type ExportFormat, type StillFormat } from "@/lib/editor/exporter";
import { getPages, pageAt } from "@/lib/editor/pages";
import { zipFiles } from "@/lib/editor/zip";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Format = ExportFormat | StillFormat;

const QUALITY_PRESETS = {
  low: 2_500_000,
  medium: 6_000_000,
  high: 12_000_000,
  ultra: 24_000_000,
} as const;
type Quality = keyof typeof QUALITY_PRESETS;

const isStill = (f: Format): f is StillFormat => f === "png" || f === "jpg";

export function ExportDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const toSnapshot = useEditorStore((s) => s.toSnapshot);
  const media = useEditorStore((s) => s.media);
  const clips = useEditorStore((s) => s.clips);
  const duration = useEditorStore(selectTimelineDuration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);

  const [format, setFormat] = useState<Format>("mp4");
  const [scaleKey, setScaleKey] = useState("1");
  const [qualityKey, setQualityKey] = useState<Quality>("high");
  const [allPages, setAllPages] = useState(true);
  const pages = getPages(settings, clips);
  const multiPage = pages.length > 1;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const videoSupported = isExportSupported();
  const still = isStill(format);
  const scale = parseFloat(scaleKey);
  const outW = Math.round(settings.width * scale);
  const outH = Math.round(settings.height * scale);

  // Each time the dialog opens, suggest the format that fits the project.
  useEffect(() => {
    if (!open) return;
    const hasMotion = clips.some((c) => c.kind === "video" || c.kind === "audio");
    setFormat(hasMotion ? "mp4" : "png");
    setScaleKey("1");
    // Only on open; changing clips while the dialog is up should not reset a choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
      setProgress(0);
      setLabel("");
    }
  }, [open]);

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(t("editor.export.done", { filename }));
  };

  const handleStill = async () => {
    if (duration <= 0) {
      toast.error(t("editor.export.empty"));
      return;
    }
    setBusy(true);
    setProgress(50);
    setLabel(t("editor.export.rendering"));
    try {
      const snapshot = toSnapshot();
      if (multiPage && allPages) {
        const files: { name: string; blob: Blob }[] = [];
        for (const p of pages) {
          setProgress(Math.round((p.index / pages.length) * 100));
          setLabel(t("editor.pages.exporting", { current: p.index + 1, total: pages.length }));
          const { blob, filename } = await exportStill({ snapshot, media, format: format as StillFormat, scale, time: p.start });
          files.push({ name: filename.replace(/.(png|jpg)$/, `-${String(p.index + 1).padStart(2, "0")}.$1`), blob });
        }
        const zip = await zipFiles(files);
        const safeTitle = (snapshot.title || "design").replace(/[^w-]+/g, "_");
        download(zip, `${safeTitle}.zip`);
      } else {
        const time = multiPage ? pageAt(pages, currentTime).start : currentTime;
        const { blob, filename } = await exportStill({ snapshot, media, format: format as StillFormat, scale, time });
        download(blob, filename);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("editor.export.failed"));
      console.error("Still export failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleVideo = async (cutEndAt?: number) => {
    const exportDuration = cutEndAt !== undefined && cutEndAt > 0 ? Math.min(cutEndAt, duration) : duration;
    if (exportDuration <= 0) {
      toast.error(t("editor.export.empty"));
      return;
    }
    setBusy(true);
    setProgress(0);
    setLabel(t("editor.export.preparing"));
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const { blob, filename } = await exportProject({
        snapshot: toSnapshot(),
        media,
        format: format as ExportFormat,
        scale,
        videoBitrate: QUALITY_PRESETS[qualityKey],
        cutEndAt,
        onProgress: (p, l) => { setProgress(Math.round(p * 100)); setLabel(l); },
        signal: ctl.signal,
      });
      download(blob, filename);
      onOpenChange(false);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.message(t("editor.export.cancelled"));
      } else {
        toast.error(e instanceof Error ? e.message : t("editor.export.failed"));
        console.error("Export failed:", e);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const qualityLabels: Record<Quality, string> = {
    low: t("editor.export.quality_low"),
    medium: t("editor.export.quality_medium"),
    high: t("editor.export.quality_high"),
    ultra: t("editor.export.quality_ultra"),
  };
  const scales = still ? ["0.5", "1", "2"] : ["1", "0.75", "0.5"];
  const canDownload = duration > 0 && (still || videoSupported);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editor.export.title")}</DialogTitle>
          <DialogDescription className="text-white/60">
            {still ? t("editor.export.stillDescription") : t("editor.export.videoDescription")}
          </DialogDescription>
        </DialogHeader>

        {!still && !videoSupported && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            {t("editor.export.unsupported")}
          </p>
        )}

        {!busy && (
          <div className="space-y-3">
            <Row label={t("editor.export.format")}>
              <Select value={format} onValueChange={(v) => { setFormat(v as Format); setScaleKey("1"); }}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  <SelectItem value="png">{t("editor.export.png")}</SelectItem>
                  <SelectItem value="jpg">{t("editor.export.jpg")}</SelectItem>
                  <SelectItem value="mp4">{t("editor.export.mp4")}</SelectItem>
                  <SelectItem value="webm">{t("editor.export.webm")}</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label={t("editor.export.resolution")}>
              <Select value={scaleKey} onValueChange={setScaleKey}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  {scales.map((k) => {
                    const s = parseFloat(k);
                    return (
                      <SelectItem key={k} value={k}>
                        {Math.round(s * 100)}% — {Math.round(settings.width * s)}×{Math.round(settings.height * s)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Row>
            {still && multiPage && (
              <Row label={t("editor.pages.label")}>
                <Select value={allPages ? "all" : "one"} onValueChange={(v) => setAllPages(v === "all")}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                    <SelectItem value="all">{t("editor.pages.allZip", { count: pages.length })}</SelectItem>
                    <SelectItem value="one">{t("editor.pages.thisPage")}</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            )}
            {!still && (
              <Row label={t("editor.export.quality")}>
                <Select value={qualityKey} onValueChange={(v) => setQualityKey(v as Quality)}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                    {(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {qualityLabels[k]} ({Math.round(QUALITY_PRESETS[k] / 1_000_000)} Mbps)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            )}

            <div className="rounded-md border border-white/10 bg-white/5 p-2.5 text-xs text-white/70">
              {still ? (
                <div>{t("editor.export.frameAt", { time: Math.min(currentTime, duration).toFixed(2) })}</div>
              ) : (
                <>
                  <div>{t("editor.export.duration", { value: duration.toFixed(2) })}</div>
                  <div>{t("editor.export.cutPreview", { value: Math.min(currentTime, duration).toFixed(2) })}</div>
                </>
              )}
              <div>
                {still
                  ? t("editor.export.outputStill", { width: outW, height: outH })
                  : t("editor.export.outputVideo", { width: outW, height: outH, fps: settings.fps })}
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div className="space-y-2 py-2">
            <Progress value={progress} className="h-2 bg-white/10" />
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{label}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {busy ? (
            !still && (
              <Button variant="ghost" onClick={() => abortRef.current?.abort()}
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
                <X className="mr-1 h-4 w-4" /> {t("editor.export.cancel")}
              </Button>
            )
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
                {t("editor.export.cancel")}
              </Button>
              {!still && (
                <Button variant="ghost" onClick={() => handleVideo(currentTime)}
                  disabled={!videoSupported || duration <= 0 || currentTime <= 0}
                  className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40">
                  <Scissors className="mr-1 h-4 w-4" /> {t("editor.export.cut")}
                </Button>
              )}
              <LiquidGlassBubble2
                label={t("editor.export.download")}
                icon={<Download className="h-4 w-4" />}
                onClick={() => (still ? handleStill() : handleVideo())}
                disabled={!canDownload}
                width="130px"
                height="36px"
                active
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-24 shrink-0 text-xs text-white/60">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
