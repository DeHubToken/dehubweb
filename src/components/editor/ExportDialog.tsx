/**
 * Export dialog — choose format/resolution/quality, then render via WebCodecs.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { Download, X, Scissors } from "lucide-react";
import { toast } from "sonner";
import { useEditorStore, selectTimelineDuration } from "@/store/editorStore";
import { exportProject, isExportSupported, type ExportFormat } from "@/lib/editor/exporter";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const QUALITY_PRESETS: Record<string, number> = {
  Low: 2_500_000,
  Medium: 6_000_000,
  High: 12_000_000,
  Ultra: 24_000_000,
};

export function ExportDialog({ open, onOpenChange }: Props) {
  const toSnapshot = useEditorStore((s) => s.toSnapshot);
  const media = useEditorStore((s) => s.media);
  const duration = useEditorStore(selectTimelineDuration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);

  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [scaleKey, setScaleKey] = useState("1");
  const [qualityKey, setQualityKey] = useState<keyof typeof QUALITY_PRESETS>("High");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const supported = isExportSupported();
  const scale = parseFloat(scaleKey);
  const outW = Math.round(settings.width * scale);
  const outH = Math.round(settings.height * scale);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setBusy(false);
      setProgress(0);
      setLabel("");
    }
  }, [open]);

  const handleExport = async (cutEndAt?: number) => {
    const exportDuration = cutEndAt !== undefined && cutEndAt > 0 ? Math.min(cutEndAt, duration) : duration;
    if (exportDuration <= 0) {
      toast.error("Add clips to the timeline first.");
      return;
    }
    setBusy(true);
    setProgress(0);
    setLabel("Preparing…");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const { blob, filename } = await exportProject({
        snapshot: toSnapshot(),
        media,
        format,
        scale,
        videoBitrate: QUALITY_PRESETS[qualityKey],
        cutEndAt,
        onProgress: (p, l) => { setProgress(Math.round(p * 100)); setLabel(l); },
        signal: ctl.signal,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Exported ${filename}`);
      onOpenChange(false);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast("Export cancelled");
      } else {
        const msg = e instanceof Error ? e.message : "Export failed";
        toast.error(msg);
        // eslint-disable-next-line no-console
        console.error("Export failed:", e);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
          <DialogDescription className="text-white/60">
            Render your timeline to a downloadable file.
          </DialogDescription>
        </DialogHeader>

        {!supported && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
            Your browser doesn't support in-browser video export. Try Chrome, Edge, Brave, or Arc.
          </p>
        )}

        {!busy && (
          <div className="space-y-3">
            <Row label="Format">
              <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  <SelectItem value="mp4">MP4 (H.264 + AAC)</SelectItem>
                  <SelectItem value="webm">WebM (VP9 + Opus)</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Resolution">
              <Select value={scaleKey} onValueChange={setScaleKey}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  <SelectItem value="1">100% — {settings.width}×{settings.height}</SelectItem>
                  <SelectItem value="0.75">75% — {Math.round(settings.width * 0.75)}×{Math.round(settings.height * 0.75)}</SelectItem>
                  <SelectItem value="0.5">50% — {Math.round(settings.width * 0.5)}×{Math.round(settings.height * 0.5)}</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Quality">
              <Select value={qualityKey} onValueChange={(v) => setQualityKey(v as keyof typeof QUALITY_PRESETS)}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  {Object.keys(QUALITY_PRESETS).map((k) => (
                    <SelectItem key={k} value={k}>{k} ({Math.round(QUALITY_PRESETS[k] / 1_000_000)} Mbps)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <div className="rounded-md border border-white/10 bg-white/5 p-2.5 text-xs text-white/70">
              <div>Duration: <span className="text-white">{duration.toFixed(2)}s</span></div>
              <div>Cut preview: <span className="text-white">{Math.min(currentTime, duration).toFixed(2)}s</span></div>
              <div>Output: <span className="text-white">{outW}×{outH} @ {settings.fps}fps</span></div>
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
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}
              className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
                Cancel
              </Button>
              <Button variant="ghost" onClick={() => handleExport(currentTime)}
                disabled={!supported || duration <= 0 || currentTime <= 0}
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40">
                <Scissors className="mr-1 h-4 w-4" /> Cut
              </Button>
              <LiquidGlassBubble2
                label="Export"
                icon={<Download className="h-4 w-4" />}
                onClick={() => handleExport()}
                disabled={!supported || duration <= 0}
                width="120px"
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
