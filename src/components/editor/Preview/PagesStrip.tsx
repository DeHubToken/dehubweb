/**
 * Page thumbnails under the canvas, Canva style. Each thumb is rendered with
 * the shared renderer at the page's first frame, from the compositor's own
 * decoded media, so it costs a few small draws and no extra downloads.
 */
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { drawClip, isVisualClip, type RenderSources } from "@/lib/editor/render";
import { getPages, pageAt, type Page } from "@/lib/editor/pages";

const THUMB_H = 44;

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
      const at = page.start + 0.001;
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

  const pages = useMemo(() => getPages(settings, clips), [settings, clips]);
  const current = pageAt(pages, currentTime);
  const multi = pages.length > 1;

  const btn = "flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-white/10 bg-black/60 px-3 py-2 scrollbar-none">
      {multi &&
        pages.map((p) => (
          <PageThumb
            key={p.index}
            page={p}
            active={p.index === current.index}
            sources={sources}
            onPick={() => { setIsPlaying(false); setCurrentTime(p.start); }}
          />
        ))}
      <button type="button" onClick={() => addPage()} className={btn} title={t("editor.pages.add")}>
        <Plus className="h-3.5 w-3.5" /> {t("editor.pages.add")}
      </button>
      <button type="button" onClick={() => addPage({ duplicate: true })} className={btn} title={t("editor.pages.duplicate")}>
        <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("editor.pages.duplicate")}</span>
      </button>
      {multi && (
        <button type="button" onClick={() => deletePage(current.index)} className={btn} title={t("editor.pages.delete")}>
          <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("editor.pages.delete")}</span>
        </button>
      )}
      {multi && (
        <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-white/45">
          {t("editor.pages.position", { current: current.index + 1, total: pages.length })}
        </span>
      )}
    </div>
  );
}
