/**
 * Page thumbnails under the canvas, Canva style. Each thumb is rendered with
 * the shared renderer at the page's first frame, from the compositor's own
 * decoded media, so it costs a few small draws and no extra downloads.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Type } from "lucide-react";
import Copy from "@/components/ui/cut-icons/copy";
import Trash2 from "@/components/ui/cut-icons/delete";

import ChevronRight from "@/components/ui/cut-icons/next";
import Play from "@/components/ui/cut-icons/play";
import Plus from "@/components/ui/cut-icons/add";

import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import { drawClip, isVisualClip, type RenderSources } from "@/lib/editor/render";
import { getPages, pageAt, pagePreviewTime, type Page } from "@/lib/editor/pages";

const THUMB_H = 44;

function PageDuration({ seconds, onApply }: { seconds: number; onApply: (seconds: number) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(Number(seconds.toFixed(2))));
  useEffect(() => setValue(String(Number(seconds.toFixed(2)))), [seconds]);
  return <form className="flex shrink-0 items-center gap-1.5" onSubmit={e => { e.preventDefault(); onApply(Number(value)); }}>
    <label className="text-[11px] text-white/60">{t("editor.pages.duration", { defaultValue: "Page duration" })}<input type="number" min={0.1} max={3600} step={0.1} required value={value} onChange={e => setValue(e.target.value)} className="ml-2 h-8 w-16 rounded-md border border-white/20 bg-white/5 px-2 text-xs text-white" /></label><span className="text-xs text-white/45">s</span>
    <button type="submit" className="h-8 rounded-md border border-white/15 px-2 text-xs text-white/75 hover:bg-white/10">{t("editor.pages.applyDuration", { defaultValue: "Apply" })}</button>
  </form>;
}

function PageThumb({ page, active, sources, onPick }: { page: Page; active: boolean; sources: RenderSources; onPick: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const clips = useEditorStore((s) => s.clips);
  const tracks = useEditorStore((s) => s.tracks);
  const settings = useEditorStore((s) => s.settings);
  const media = useEditorStore((s) => s.media);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cvs = ref.current;
      const ctx = cvs?.getContext("2d");
      if (!cvs || !ctx) return;
      const W = Math.round((THUMB_H * settings.width) / settings.height);
      cvs.width = W * 2;
      cvs.height = THUMB_H * 2;
      const k = cvs.height / settings.height;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = settings.background;
      ctx.fillRect(0, 0, settings.width, settings.height);
      const hidden = new Set(tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
      const z = (id: string) => tracks.findIndex((tr) => tr.id === id);
      const at = pagePreviewTime(page);
      clips
        .filter((c) => isVisualClip(c) && !hidden.has(c.trackId) && at >= c.start && at < c.start + c.duration)
        .sort((a, b) => z(a.trackId) - z(b.trackId))
        .forEach((c) => {
          ctx.save();
          drawClip(ctx, settings.width, settings.height, c, at, sources);
          ctx.restore();
        });
    };
    // Media may still be decoding on first paint; redraw once it has had a moment.
    raf = requestAnimationFrame(draw);
    const late = window.setTimeout(draw, 800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
    };
  }, [page.start, clips, tracks, settings, media, sources]);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={t("editor.pages.page", { number: page.index + 1 })}
      aria-current={active}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md ring-1 transition",
        active ? "ring-2 ring-white" : "ring-white/15 hover:ring-white/40",
      )}
      style={{ height: THUMB_H }}
    >
      <canvas ref={ref} className="h-full w-auto" />
      <span className="absolute bottom-0.5 left-1 rounded bg-black/60 px-1 text-[9px] font-semibold tabular-nums text-white">
        {page.index + 1}
      </span>
    </button>
  );
}

export function PagesStrip({ sources }: { sources: RenderSources }) {
  const { t } = useTranslation();
  const clips = useEditorStore((s) => s.clips);
  const settings = useEditorStore((s) => s.settings);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const addPage = useEditorStore((s) => s.addPage);
  const deletePage = useEditorStore((s) => s.deletePage);
  const movePage = useEditorStore((s) => s.movePage);
  const resizePage = useEditorStore((s) => s.resizePage);

  const pages = useMemo(() => getPages(settings, clips), [settings, clips]);
  const current = pageAt(pages, currentTime);
  const multi = pages.length > 1;

  const btn = "flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white";

  const pick = (page: Page) => {
    setIsPlaying(false);
    useEditorStore.getState().selectClip(null);
    setCurrentTime(pagePreviewTime(page));
  };
  const headline = (page: Page) => clips.filter(c => c.kind === "text" && c.start < page.end && c.start + c.duration > page.start)
    .sort((a, b) => (b.kind === "text" ? b.fontSize : 0) - (a.kind === "text" ? a.fontSize : 0))
    .find(c => c.kind === "text");
  return (
    <div className="min-w-0 shrink-0 border-t border-white/10 bg-black/60 px-3 py-2">
      {multi && <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-white/85">{t("editor.pages.position", { current: current.index + 1, total: pages.length })}</span>
        <button type="button" className={btn + " disabled:opacity-30"} disabled={current.index === 0} aria-label={t("editor.captions.previousText")} onClick={() => pick(pages[current.index - 1])}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className={btn + " disabled:opacity-30"} disabled={current.index === pages.length - 1} aria-label={t("editor.captions.nextText")} onClick={() => pick(pages[current.index + 1])}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => useEditorUiStore.getState().setPanel("text")}><Type className="h-3.5 w-3.5" />{t("editor.menu.editText")}</button>
        <button type="button" className={btn} onClick={() => useEditorUiStore.getState().setTimelineOpen(true)}>{t("editor.canvas.showTimeline")}</button>
        <button type="button" className={btn + " ml-auto"} onClick={() => { useEditorStore.getState().selectClip(null); setCurrentTime(0); setIsPlaying(true); }}><Play className="h-3.5 w-3.5" />{t("creator.preview")} · {t("creator.navVideo")} <span className="tabular-nums text-white/50">{pages[pages.length - 1].end}s</span></button>
      </div>}
      {multi && <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className={btn + " disabled:opacity-30"} disabled={current.index === 0} onClick={() => movePage(current.index, current.index - 1)}>{t("editor.pages.moveEarlier", { defaultValue: "Move page earlier" })}</button>
        <button type="button" className={btn + " disabled:opacity-30"} disabled={current.index === pages.length - 1} onClick={() => movePage(current.index, current.index + 1)}>{t("editor.pages.moveLater", { defaultValue: "Move page later" })}</button>
      </div>}
      <div className="flex min-w-0 items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
        <PageDuration key={current.index} seconds={current.end - current.start} onApply={seconds => resizePage(current.index, seconds)} />
        {multi && pages.map(p => {
          const title = headline(p);
          return <div key={p.index} className="flex w-28 shrink-0 flex-col gap-1">
            <PageThumb page={p} active={p.index === current.index} sources={sources} onPick={() => pick(p)} />
            <button type="button" onClick={() => pick(p)} className="text-left text-[11px] leading-snug" aria-label={`${t("editor.pages.page", { number: p.index + 1 })}: ${title?.kind === "text" ? title.text : ""}`}>
              <span className={p.index === current.index ? "text-white" : "text-white/65"}>{t("editor.pages.page", { number: p.index + 1 })} · {Number((p.end - p.start).toFixed(2))}s</span>
              <span className="block truncate text-white/45">{title?.kind === "text" ? title.text : ""}</span>
            </button>
          </div>;
        })}
        <button type="button" onClick={() => addPage()} className={btn} title={t("editor.pages.add")}><Plus className="h-3.5 w-3.5" />{t("editor.pages.add")}</button>
        <button type="button" onClick={() => addPage({ duplicate: true })} className={btn} title={t("editor.pages.duplicate")}><Copy className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("editor.pages.duplicate")}</span></button>
        {multi && <button type="button" onClick={() => deletePage(current.index)} className={btn} title={t("editor.pages.delete")}><Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t("editor.pages.delete")}</span></button>}
      </div>
    </div>
  );
}
