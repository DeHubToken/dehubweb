import { PresentationPagePicker } from "./PresentationPagePicker";
import { designPageLinkIndex, designPdfLink, type DesignPdfLink } from "@/lib/editor/designLinks";
import { resolveClipAt } from "@/lib/editor/keyframes";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { clipBox, drawClip, isVisualClip, type RenderSources } from "@/lib/editor/render";
import { getPages, pageAt, pagePreviewTime } from "@/lib/editor/pages";

export function PresentationView({ sources, onClose }: { sources: RenderSources; onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useEditorStore(s => s.settings), clips = useEditorStore(s => s.clips), tracks = useEditorStore(s => s.tracks);
  const pages = getPages(settings, clips);
  const [links, setLinks] = useState<DesignPdfLink[]>([]), previousLinks = useRef("");
  const [index, setIndex] = useState(() => pageAt(pages, useEditorStore.getState().currentTime).index);
  const [pagePicker, setPagePicker] = useState(false);
  const [notes, setNotes] = useState(false), [black, setBlack] = useState(false), [auto, setAuto] = useState(false), [seconds, setSeconds] = useState(5);
  const page = pages[Math.min(index, pages.length - 1)], details = settings.pageDetails?.[page.index];
  const root = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const fullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void root.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { if (document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {}); previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const store = useEditorStore.getState(); store.setIsPlaying(false); store.selectClip(null); store.setCurrentTime(pagePreviewTime(page)); setBlack(false); setLinks([]); previousLinks.current = "";
  }, [page.index, page.start, page.end]);
  useEffect(() => {
    if (!auto || black) return;
    if (page.index >= pages.length - 1) { setAuto(false); return; }
    const timeout = window.setTimeout(() => setIndex(page.index + 1), seconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [auto, black, seconds, page.index, pages.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" && event.target instanceof Element && event.target.closest("input, select, textarea")) return;
      if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.key) || (event.code === "Space" && !(event.target instanceof Element && event.target.closest("button")))) { event.preventDefault(); setIndex(value => Math.min(pages.length - 1, value + 1)); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); }
      else if (event.key === "Home") { event.preventDefault(); setIndex(0); }
      else if (event.key === "End") { event.preventDefault(); setIndex(pages.length - 1); }
      else if (event.key.toLowerCase() === "b") setBlack(value => !value);
      else if (event.key.toLowerCase() === "n") { setPagePicker(false); setNotes(value => !value); }
      else if (event.key.toLowerCase() === "g") { setNotes(false); setAuto(false); setPagePicker(value => !value); }
      else if (event.key.toLowerCase() === "f") fullScreen();
      else if (event.key === "Tab") {
        const buttons = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select, input") ?? []);
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [pages.length]);
  useEffect(() => {
    let frame = 0, lastDraw = -Infinity;
    const hidden = new Set(tracks.filter(track => track.hidden).map(track => track.id)), order = new Map(tracks.map((track, index) => [track.id, index]));
    const at = pagePreviewTime(page), visible = clips.filter(clip => isVisualClip(clip) && !clip.hidden && !hidden.has(clip.trackId) && at >= clip.start && at < clip.start + clip.duration).sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
    const draw = (now: number) => {
      if (now - lastDraw < 200) { frame = requestAnimationFrame(draw); return; }
      lastDraw = now;
      const element = canvas.current, box = stage.current;
      if (element && box && !document.hidden) {
        const scale = Math.min(box.clientWidth / settings.width, box.clientHeight / settings.height), ratio = Math.min(window.devicePixelRatio || 1, 2, 2560 / Math.max(1, settings.width * scale, settings.height * scale));
        const width = Math.max(1, Math.round(settings.width * scale * ratio)), height = Math.max(1, Math.round(settings.height * scale * ratio));
        if (element.width !== width) element.width = width;
        if (element.height !== height) element.height = height;
        element.style.width = `${settings.width * scale}px`; element.style.height = `${settings.height * scale}px`;
        const ctx = element.getContext("2d");
        if (ctx) {
          ctx.setTransform(width / settings.width, 0, 0, height / settings.height, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = settings.background; ctx.fillRect(0, 0, settings.width, settings.height);
          const hotspots: DesignPdfLink[] = [];
          for (const clip of visible) { const box = clip.href ? clipBox(ctx, resolveClipAt(clip, at), settings.width, settings.height, sources) : null; const link = box ? designPdfLink(clip.href, box, settings.width, settings.height, { alpha: 1, scale: 1, dx: 0, dy: 0 }) : null; if (link) hotspots.push(link); ctx.save(); try { drawClip(ctx, settings.width, settings.height, { ...clip, animateIn: undefined, animateOut: undefined }, at, sources); } finally { ctx.restore(); } }
          const serialized = JSON.stringify(hotspots); if (serialized !== previousLinks.current) { previousLinks.current = serialized; setLinks(hotspots); }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [clips, tracks, settings, page.start, page.end, sources]);
  const button = "min-h-10 rounded-lg border border-white/20 px-3 text-xs text-white/80 hover:bg-white/10 disabled:opacity-30";
  return createPortal(<div ref={root} role="dialog" aria-modal="true" aria-label={t("editor.present.title", { defaultValue: "Present pages" })} tabIndex={-1} className="fixed inset-0 z-[200] flex flex-col bg-black text-white outline-none">
    <div className="flex shrink-0 items-center gap-3 px-4 py-3"><span aria-live="polite" className="min-w-0 flex-1 truncate text-sm">{details?.title || t("editor.pages.page", { number: page.index + 1 })}</span><button type="button" className={button} onClick={fullScreen}>{t("editor.present.fullscreen", { defaultValue: "Fullscreen" })}</button><button type="button" className={button} onClick={onClose}>{t("editor.present.close", { defaultValue: "Close presentation" })}</button></div>
    <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"><div className="relative"><canvas ref={canvas} role="img" aria-label={details?.title || t("editor.pages.page", { number: page.index + 1 })} />{!black && links.map((link, index) => <button key={`${page.index}:${index}:${link.url}`} type="button" aria-label={designPageLinkIndex(link.url) === null ? link.url : t("editor.links.openPage", { defaultValue: "Go to page {{number}}", number: designPageLinkIndex(link.url)! + 1 })} onClick={() => { const target = designPageLinkIndex(link.url); if (target !== null) { if (pages[target]) { setAuto(false); setIndex(target); } } else window.open(link.url, "_blank", "noopener,noreferrer"); }} className="absolute cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" style={{ left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.width * 100}%`, height: `${link.height * 100}%` }} />)}</div>{black && <div className="absolute inset-0 bg-black" aria-label={t("editor.present.blackout", { defaultValue: "Blackout" })} />}</div>
    {pagePicker && <PresentationPagePicker count={pages.length} current={page.index} details={settings.pageDetails} onPick={index => { setAuto(false); setIndex(index); setPagePicker(false); }} />}
    {notes && <aside className="max-h-[25vh] shrink-0 overflow-y-auto border-t border-white/15 px-4 py-3"><p className="mb-2 text-xs font-medium text-white/45">{t("editor.present.notes", { defaultValue: "Presenter notes" })}</p><p className="whitespace-pre-wrap break-words text-sm text-white/80">{details?.notes || t("editor.present.noNotes", { defaultValue: "No notes for this page" })}</p></aside>}
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-3"><button type="button" className={button} aria-pressed={pagePicker} onClick={() => { setNotes(false); setAuto(false); setPagePicker(value => !value); }} title={t("editor.present.pagePickerShortcut", { defaultValue: "Browse pages (G)" })}>{t("editor.present.browsePages", { defaultValue: "Pages" })}</button><button type="button" className={button} disabled={page.index === 0} onClick={() => setIndex(page.index - 1)}>{t("editor.present.previous", { defaultValue: "Previous" })}</button><span className="px-2 text-xs tabular-nums text-white/50">{page.index + 1} / {pages.length}</span><button type="button" className={button} disabled={page.index === pages.length - 1} onClick={() => setIndex(page.index + 1)}>{t("editor.present.next", { defaultValue: "Next" })}</button><button type="button" className={button} aria-pressed={auto} onClick={() => { if (!auto && page.index === pages.length - 1) setIndex(0); setAuto(value => !value); }}>{t(auto ? "editor.present.stopAuto" : "editor.present.startAuto", { defaultValue: auto ? "Stop auto advance" : "Auto advance" })}</button><select value={seconds} onChange={event => setSeconds(Number(event.target.value))} aria-label={t("editor.present.interval", { defaultValue: "Seconds per page" })} className="min-h-10 rounded-lg border border-white/20 bg-neutral-900 px-2 text-xs">{[3, 5, 10, 15, 30, 60].map(value => <option key={value} value={value}>{value}s</option>)}</select><button type="button" className={button} aria-pressed={black} onClick={() => setBlack(value => !value)}>{t("editor.present.blackout", { defaultValue: "Blackout" })}</button><button type="button" className={button} aria-pressed={notes} onClick={() => { setPagePicker(false); setNotes(value => !value); }}>{t("editor.present.notes", { defaultValue: "Presenter notes" })}</button></div>
  </div>, document.body);
}
