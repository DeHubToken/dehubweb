import { JpegQualityControl } from "./JpegQualityControl";
import { presentationNotesText } from "@/lib/editor/presentationNotesText";
import { SectionExportPicker } from "./SectionExportPicker";
import { designPageSections } from "@/lib/editor/pageDetails";
import { pageFilenamePatternError } from "@/lib/editor/pageFilenamePattern";
import { prepareFileShare } from "@/lib/editor/shareFile";
import { hasTimelineMotion } from "@/lib/editor/projectMotion";
import { useTranslation as _useCopy } from 'react-i18next';
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
import Scissors from "@/components/ui/cut-icons/trim";

import Download from "@/components/ui/cut-icons/download";
import X from "@/components/ui/cut-icons/close";

import { toast } from "sonner";
import { useEditorStore, selectTimelineDuration } from "@/store/editorStore";
import { exportProject, exportStill, isExportSupported, type ExportFormat, type StillFormat } from "@/lib/editor/exporter";
import { getPages } from "@/lib/editor/pages";
import { pageExportFrames, resolvePageExportScope } from "@/lib/editor/pageExports";
import { exportFilename } from "@/lib/editor/exportName";
import { zipFiles } from "@/lib/editor/zip";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND_OUTRO_DURATION } from "@/lib/editor/brandOutro";
import { GIF_CONTENT_LIMIT, gifPlan } from "@/lib/editor/gif";
import { clipExportRanges, type ExportScope } from "@/lib/editor/exportRanges";
import { ZIP_DOWNLOAD_LIMIT } from "@/lib/editor/zipArchive";
import { zipDownloadFiles } from "@/lib/editor/zipDownloadFiles";
import { writePdfDocument } from "@/lib/editor/pdfDocument";
import { exportPresentation } from "@/lib/editor/exportPresentation";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Format = ExportFormat | StillFormat | "pdf" | "pptx" | "notes";

const QUALITY_PRESETS = {
  low: 2_500_000,
  medium: 6_000_000,
  high: 12_000_000,
  ultra: 24_000_000,
} as const;
type Quality = keyof typeof QUALITY_PRESETS;

const isStill = (f: Format): boolean => f === "png" || f === "jpg" || f === "pdf" || f === "pptx" || f === "notes";

export function ExportDialog({ open, onOpenChange }: Props) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { user } = useAuth();
  const toSnapshot = useEditorStore((s) => s.toSnapshot);
  const media = useEditorStore((s) => s.media);
  const clips = useEditorStore((s) => s.clips);
  const duration = useEditorStore(selectTimelineDuration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const tracks = useEditorStore((s) => s.tracks);

  const [format, setFormat] = useState<Format>("mp4");
  const [scaleKey, setScaleKey] = useState("1");
  const [qualityKey, setQualityKey] = useState<Quality>("high");
  const [pageScope, setPageScope] = useState<"all" | "current" | "custom" | "section">("all");
  const [sectionName, setSectionName] = useState("");
  const [pageSelection, setPageSelection] = useState("1");
  const [filenamePattern, setFilenamePattern] = useState("");
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [transparent, setTransparent] = useState(false);
  const [cropMarks, setCropMarks] = useState(false);
  const [bookmarks, setBookmarks] = useState(true);
  const [scope, setScope] = useState<ExportScope>("timeline");
  const rangeSnapshot = { ...toSnapshot(), clips, tracks };
  const allRanges = clipExportRanges(rangeSnapshot);
  const selectedRanges = clipExportRanges(rangeSnapshot, selectedClipIds);
  const ranges = scope === "selection" ? selectedRanges : allRanges;
  const pages = getPages(settings, clips);
  const multiPage = pages.length > 1;
  const sections = designPageSections(rangeSnapshot), effectiveSection = sections.some(section => section.name === sectionName) ? sectionName : sections[0]?.name ?? "";

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const videoSupported = isExportSupported();
  const still = isStill(format);
  const gif = format === "gif";
  const scale = parseFloat(scaleKey);
  const gifOutput = gifPlan(settings.width, settings.height, scale, BRAND_OUTRO_DURATION, settings.fps);
  const outW = gif ? gifOutput.width : Math.round(settings.width * scale);
  const outH = gif ? gifOutput.height : Math.round(settings.height * scale);
  const motionSupported = gif || videoSupported;

  // Each time the dialog opens, suggest the format that fits the project.
  useEffect(() => {
    if (!open) return;
    const hasMotion = hasTimelineMotion(clips);
    setFormat(hasMotion ? "mp4" : "png");
    setScaleKey("1"); setFilenamePattern("");
    setScope("timeline");
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
    const share = prepareFileShare(blob, filename);
    toast.success(t("editor.export.done", { filename }), share ? {
      duration: 15000,
      action: { label: t("postOptions.share", { defaultValue: "Share" }), onClick: () => { void share().catch(() => toast.error(t("editor.export.failed"))); } },
    } : undefined);
  };

  const handleStill = async () => {
    if (duration <= 0) {
      toast.error(t("editor.export.empty"));
      return;
    }
    setBusy(true);
    setProgress(50);
    setLabel(t("editor.export.rendering"));
    const ctl = new AbortController(); abortRef.current = ctl;
    const check = () => { if (ctl.signal.aborted) throw new DOMException("Export cancelled", "AbortError"); };
    try {
      const snapshot = toSnapshot();
      if (format === "notes") {
        const content = presentationNotesText(snapshot, currentTime, resolvePageExportScope(snapshot, pageScope, pageSelection, effectiveSection));
        download(new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }), exportFilename(snapshot.title, "txt", "-notes", "design"));
        setProgress(100); onOpenChange(false); return;
      }
      const imageFormat = format === "pdf" || format === "pptx" ? "jpg" : format as StillFormat;
      const frames = pageExportFrames(snapshot, currentTime, resolvePageExportScope(snapshot, pageScope, pageSelection, effectiveSection), imageFormat, format === "png" || format === "jpg" ? filenamePattern : "");
      if (format === "pptx") {
        let captured = 0;
        const blob = await exportPresentation(snapshot, currentTime, resolvePageExportScope(snapshot, pageScope, pageSelection, effectiveSection), async time => {
          check(); setLabel(t("editor.pages.exporting", { current: ++captured, total: frames.length }));
          return exportStill({ snapshot, media, format: "jpg", quality: 0.95, scale, ignoreAnimations: true, time });
        }, ctl.signal, fraction => setProgress(Math.round(fraction * 100)));
        check(); download(blob, exportFilename(snapshot.title, "pptx", "", "design"));
      } else if (format === "pdf") {
        const parts: ArrayBuffer[] = [];
        await writePdfDocument(frames.length, async index => {
          check();
          setProgress(Math.round(index / frames.length * 95));
          setLabel(t("editor.pages.exporting", { current: index + 1, total: frames.length }));
          const { blob, links } = await exportStill({ snapshot, media, format: "jpg", quality: 0.95, scale, ignoreAnimations: true, time: frames[index].time });
          return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: Math.max(2, Math.round(snapshot.settings.width * scale)), height: Math.max(2, Math.round(snapshot.settings.height * scale)), designWidth: snapshot.settings.width, designHeight: snapshot.settings.height, dpi: snapshot.settings.printDpi, cropMarks, links };
        }, part => { parts.push(part.slice().buffer as ArrayBuffer); }, ctl.signal, frames.map(frame => frame.index), { title: snapshot.title, bookmarks, pageSections: frames.map(frame => snapshot.settings.pageDetails?.[frame.index]?.section ?? ""), pageTitles: frames.map(frame => snapshot.settings.pageDetails?.[frame.index]?.title ?? ""), pageLabels: frames.map(frame => String(frame.index + 1)) });
        check(); download(new Blob(parts, { type: "application/pdf" }), exportFilename(snapshot.title, "pdf", "", "design"));
      } else if (frames.length > 1) {
        const files: { name: string; blob: Blob }[] = [];
        for (const [index, frame] of frames.entries()) {
          check();
          setProgress(Math.round((index / frames.length) * 100));
          setLabel(t("editor.pages.exporting", { current: index + 1, total: frames.length }));
          const { blob } = await exportStill({ snapshot, media, format: format as StillFormat, quality: jpegQuality, scale, ignoreAnimations: true, time: frame.time, transparent });
          check();
          files.push({ name: frame.filename, blob });
        }
        const zip = await zipFiles(files);
        check();
        download(zip, exportFilename(snapshot.title, "zip", "", "design"));
      } else {
        const time = frames[0].time;
        const { blob } = await exportStill({ snapshot, media, format: format as StillFormat, quality: jpegQuality, scale, ignoreAnimations: multiPage, time, transparent });
        check();
        download(blob, frames[0].filename);
      }
      onOpenChange(false);
    } catch (e) {
      if ((e as Error).name === "AbortError") toast.message(t("editor.export.cancelled"));
      else { toast.error(e instanceof Error ? e.message : t("editor.export.failed")); console.error("Still export failed:", e); }
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setBusy(false);
    }
  };

  const handleVideo = async (cutEndAt?: number) => {
    const exportDuration = cutEndAt !== undefined && cutEndAt > 0 ? Math.min(cutEndAt, duration) : duration;
    if (exportDuration <= 0) {
      toast.error(t("editor.export.empty"));
      return;
    }
    const snapshot = toSnapshot();
    const batch = scope === "timeline" ? null : clipExportRanges(snapshot, scope === "selection" ? selectedClipIds : undefined);
    if (batch && !batch.length) { toast.error(t("editor.export.empty")); return; }
    if (gif && (batch ? batch.some(r => r.end - r.start > GIF_CONTENT_LIMIT) : exportDuration > GIF_CONTENT_LIMIT)) { toast.error(t("editor.export.gifTooLong")); return; }
    setBusy(true);
    setProgress(0);
    setLabel(t("editor.export.preparing"));
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const baseOptions = {
        snapshot,
        media,
        format: format as ExportFormat,
        scale,
        videoBitrate: QUALITY_PRESETS[qualityKey],
        cutEndAt,
        username: user?.username,
        signal: ctl.signal,
      };
      if (batch) {
        const files: { name: string; blob: Blob }[] = [];
        let size = 0;
        for (const [index, range] of batch.entries()) {
          const result = await exportProject({ ...baseOptions, range, cutEndAt: undefined,
            onProgress: p => {
              setProgress(Math.round(((index + p) / batch.length) * 95));
              setLabel(t("editor.export.exportingClips", { current: index + 1, total: batch.length }));
            },
          });
          size += result.blob.size;
          if (size > ZIP_DOWNLOAD_LIMIT) throw new Error(t("editor.export.archiveTooLarge"));
          files.push({ name: exportFilename(range.name, format), blob: result.blob });
        }
        const blob = files.length === 1 ? files[0].blob : await zipDownloadFiles(files, ctl.signal);
        if (ctl.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
        const filename = files.length === 1 ? files[0].name : exportFilename(snapshot.title, "zip", "-clips");
        download(blob, filename);
      } else {
        const { blob, filename } = await exportProject({ ...baseOptions,
          onProgress: (p, l) => { setProgress(Math.round(p * 100)); setLabel(l); },
        });
        download(blob, filename);
      }
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
  const gifTooLong = gif && (scope === "timeline" ? duration > GIF_CONTENT_LIMIT : ranges.some(r => r.end - r.start > GIF_CONTENT_LIMIT));
  const filenameError = format === "png" || format === "jpg" ? pageFilenamePatternError(filenamePattern) : "";
  const canDownload = !filenameError && !(still && pageScope === "section" && !effectiveSection) && duration > 0 && (still || motionSupported) && (still || scope === "timeline" || ranges.length > 0) && !gifTooLong;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editor.export.title")}</DialogTitle>
          <DialogDescription className="text-white/60">
            {format === "notes" ? t("editor.export.notesTextHint", { defaultValue: "Downloads section headings, original page numbers, page names, and presenter notes as a text file." }) : gif ? t("editor.export.gifHint") : still ? t("editor.export.stillDescription") : t("editor.export.videoDescription")}
          </DialogDescription>
        </DialogHeader>

        {!still && !motionSupported && (
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
                  <SelectItem value="pdf">{t("editor.export.pdf", { defaultValue: "PDF document" })}</SelectItem>
                  <SelectItem value="notes">{t("editor.export.notesText", { defaultValue: "Presenter notes (.txt)" })}</SelectItem>
                    <SelectItem value="pptx">{t("editor.export.pptx", { defaultValue: "PowerPoint presentation" })}</SelectItem>
                  <SelectItem value="mp4">{t("editor.export.mp4")}</SelectItem>
                  <SelectItem value="webm">{t("editor.export.webm")}</SelectItem>
                  <SelectItem value="gif">{t("emojiPicker.tabGif")}</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            {!still && allRanges.length > 0 && (
              <Row label={t("editor.export.scope")}>
                <Select value={scope} onValueChange={v => setScope(v as ExportScope)}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                    <SelectItem value="timeline">{t("editor.export.downloadTimeline")}</SelectItem>
                    <SelectItem value="selection" disabled={!selectedRanges.length}>{t("editor.export.downloadSelection", { count: selectedRanges.length })}</SelectItem>
                    <SelectItem value="clips">{t("editor.export.downloadClips", { count: allRanges.length })}</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            )}
            {format !== "notes" && <Row label={t("editor.export.resolution")}>
              <Select value={scaleKey} onValueChange={setScaleKey}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                  {scales.map((k) => {
                    const s = parseFloat(k);
                    return (
                      <SelectItem key={k} value={k}>
                        {Math.round(s * 100)}% — {gif ? gifPlan(settings.width, settings.height, s, BRAND_OUTRO_DURATION, settings.fps).width : Math.round(settings.width * s)}×{gif ? gifPlan(settings.width, settings.height, s, BRAND_OUTRO_DURATION, settings.fps).height : Math.round(settings.height * s)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Row>}
            {format === "pdf" && <label className="flex min-h-9 items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={cropMarks} onChange={event => setCropMarks(event.target.checked)} />{t("editor.export.cropMarks", { defaultValue: "Crop marks and print margins" })}</label>}
            {format === "pdf" && multiPage && <label className="flex min-h-9 items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={bookmarks} onChange={event => setBookmarks(event.target.checked)} />{t("editor.export.pageBookmarks", { defaultValue: "Page-name bookmarks" })}</label>}
            {format === "pdf" && cropMarks && <p className="text-xs text-white/45">{t("editor.export.cropMarkHint", { defaultValue: "Adds cutting marks outside the artwork. The saved print resolution sets the finished page size." })}</p>}
            {(format === "png" || format === "jpg") && <div className="space-y-2"><label className="text-xs text-white/65">{t("editor.export.filenamePattern", { defaultValue: "Page filename pattern" })}<Input value={filenamePattern} maxLength={160} onChange={event => setFilenamePattern(event.target.value)} placeholder="{title}-{page:2}-{name}" className="mt-2 h-9 border-white/10 bg-white/5 text-white" /></label><div className="flex flex-wrap gap-2">{[["", "Default"], ["{title}-{page:2}", "Title and number"], ["{page:2}-{name}", "Page names"]].map(([pattern, label]) => <button type="button" key={label} onClick={() => setFilenamePattern(pattern)} className="min-h-8 rounded-lg border border-white/20 px-3 text-xs text-white/65">{t(`editor.export.filenamePreset.${label}`, { defaultValue: label })}</button>)}</div><p className="text-[10px] text-white/45">{t("editor.export.filenameHint", { defaultValue: "Leave blank for default names. Use {title}, {name}, {section}, {page}, or {page:3}. Add a prefix as plain text. Duplicate names receive a page-number suffix." })}</p>{filenameError && <p role="alert" className="text-xs text-red-300">{filenameError}</p>}</div>}
            {format === "jpg" && <JpegQualityControl value={jpegQuality} onChange={setJpegQuality} />}
            {format === "png" && <label className="flex min-h-9 items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />{t("editor.export.transparent", { defaultValue: "Transparent background" })}</label>}
            {format === "notes" && <p className="text-xs text-white/55">{t("editor.export.notesTextHint", { defaultValue: "Downloads section headings, original page numbers, page names, and presenter notes as a text file." })}</p>}
            {format === "pptx" && <p className="text-xs text-white/55">{t("editor.export.pptxHint", { defaultValue: "Each page becomes one slide image, with presenter notes and links. Edit individual text and elements in the original design." })}</p>}
            {still && multiPage && (
              <Row label={t("editor.pages.label")}>
                <Select value={pageScope} onValueChange={v => setPageScope(v as typeof pageScope)}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                    <SelectItem value="all">{format === "pptx" ? t("editor.pages.allPptx", { defaultValue: "All {{count}} pages in one presentation", count: pages.length }) : format === "notes" ? t("editor.pages.allNotes", { defaultValue: "All {{count}} pages in one notes file", count: pages.length }) : format === "pdf" ? t("editor.pages.allPdf", { defaultValue: "All {{count}} pages in one PDF", count: pages.length }) : t("editor.pages.allZip", { count: pages.length })}</SelectItem>
                    <SelectItem value="current">{t("editor.pages.thisPage")}</SelectItem>
                    {!!sections.length && <SelectItem value="section">{t("editor.export.section", { defaultValue: "Named section" })}</SelectItem>}
                    <SelectItem value="custom">{t("editor.pages.choosePages", { defaultValue: "Choose pages" })}</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
            )}
            {still && pageScope === "section" && <SectionExportPicker sections={sections} value={effectiveSection} onChange={setSectionName} />}
            {still && multiPage && pageScope === "custom" && <Row label={t("editor.pages.pageNumbers", { defaultValue: "Page numbers" })}><Input value={pageSelection} onChange={e => setPageSelection(e.target.value)} placeholder="1,3-5" aria-label={t("editor.pages.pageNumbers", { defaultValue: "Page numbers" })} className="h-9 border-white/10 bg-white/5 text-white" /></Row>}
            {!still && !gif && (
              <Row label={t("editor.export.quality")}>
                <Select value={qualityKey} onValueChange={(v) => setQualityKey(v as Quality)}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-black/90 text-white backdrop-blur-[24px]">
                    {(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {qualityLabels[k]} ({Math.round(QUALITY_PRESETS[k] / 1_000_000)}{_copy("copy.cfcb306ffbd8", { defaultValue: " Mbps)" })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
            )}

            <div className="rounded-md border border-white/10 bg-white/5 p-2.5 text-xs text-white/70">
              {format === "notes" ? <div>{t("editor.export.notesText", { defaultValue: "Presenter notes (.txt)" })}</div> : still ? (
                <div>{t("editor.export.frameAt", { time: Math.min(currentTime, duration).toFixed(2) })}</div>
              ) : (
                <>
                  {scope === "timeline" ? <>
                    <div>{t("editor.export.duration", { value: (duration + BRAND_OUTRO_DURATION).toFixed(2) })}</div>
                    <div>{t("editor.export.cutPreview", { value: Math.min(currentTime, duration).toFixed(2) })}</div>
                  </> : <div>{t("editor.export.rangeHint")}</div>}
                </>
              )}
              {format !== "notes" && <div>
                {still
                  ? t("editor.export.outputStill", { width: outW, height: outH })
                  : t("editor.export.outputVideo", { width: outW, height: outH, fps: gif ? gifOutput.fps : settings.fps })}
              </div>}
              {gifTooLong && <div>{t("editor.export.gifTooLong")}</div>}
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
                <X className="mr-1 h-4 w-4" /> {t("editor.export.cancel")}
              </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}
                className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
                {t("editor.export.cancel")}
              </Button>
              {!still && scope === "timeline" && (
                <Button variant="ghost" onClick={() => handleVideo(currentTime)}
                  disabled={!motionSupported || duration <= 0 || currentTime <= 0 || (gif && Math.min(currentTime, duration) > GIF_CONTENT_LIMIT)}
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
