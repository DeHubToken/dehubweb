import { useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { presentationInkPath, type usePresentationMarkup } from "@/lib/editor/usePresentationMarkup";
type Markup = ReturnType<typeof usePresentationMarkup>;

export function PresentationMarkup({ markup, onStart }: { markup: Markup; onStart: () => void }) {
  const pointerId = useRef<number | null>(null);
  const point = (event: PointerEvent<HTMLDivElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - box.left) / Math.max(1, box.width), y: (event.clientY - box.top) / Math.max(1, box.height) }; };
  return <div className="absolute inset-0" style={{ pointerEvents: markup.tool === "none" ? "none" : "auto", touchAction: "none", cursor: markup.tool === "none" ? undefined : "crosshair" }}
    onPointerDown={event => { if (event.button !== 0 || pointerId.current !== null) return; event.preventDefault(); pointerId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); onStart(); markup.begin(point(event)); }}
    onPointerMove={event => { if (markup.tool === "laser" || pointerId.current === event.pointerId) markup.move(point(event)); }}
    onPointerUp={event => { if (pointerId.current !== event.pointerId) return; markup.move(point(event)); markup.end(); pointerId.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onLostPointerCapture={() => { if (pointerId.current !== null) { pointerId.current = null; markup.end(); } }}
    onPointerCancel={() => { pointerId.current = null; markup.end(); }}
    onPointerLeave={() => { if (markup.tool === "laser" && pointerId.current === null) markup.end(); }}>
    <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0">{[...markup.strokes, ...(markup.active ? [markup.active] : [])].map((stroke, index) => <path key={index} d={presentationInkPath(stroke.points, 1000, 1000)} fill="none" stroke={stroke.colour} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}</svg>
    {markup.pointer && markup.tool === "laser" && <span aria-hidden="true" className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-red-500 shadow-[0_0_12px_4px_rgba(239,68,68,0.65)]" style={{ left: `${markup.pointer.x * 100}%`, top: `${markup.pointer.y * 100}%` }} />}
  </div>;
}

export function PresentationMarkupTools({ markup, onStart }: { markup: Markup; onStart: () => void }) {
  const { t } = useTranslation(), button = "min-h-9 rounded-lg border border-white/20 px-3 text-xs text-white/75 disabled:opacity-35";
  return <div role="toolbar" aria-label={t("editor.present.markup", { defaultValue: "Presentation markup" })} className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
    {(["none", "laser", "pen"] as const).map(tool => <button type="button" key={tool} aria-pressed={markup.tool === tool} className={`${button} ${markup.tool === tool ? "border-cyan-300 bg-cyan-300/10" : ""}`} onClick={() => { onStart(); markup.setTool(tool); }}>{t(`editor.present.markTool.${tool}`, { defaultValue: ({ none: "Navigate", laser: "Laser pointer", pen: "Pen" })[tool] })}</button>)}
    {markup.tool === "pen" && ["#facc15", "#f87171", "#38bdf8", "#ffffff"].map(colour => <button type="button" key={colour} aria-label={t("editor.present.inkColour", { defaultValue: "Ink colour {{colour}}", colour })} aria-pressed={markup.colour === colour} onClick={() => markup.setColour(colour)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${markup.colour === colour ? "border-cyan-300" : "border-white/20"}`}><span className="h-4 w-4 rounded-full" style={{ backgroundColor: colour }} /></button>)}
    <button type="button" disabled={!markup.canUndo} className={button} onClick={markup.undo}>{t("editor.present.undoMark", { defaultValue: "Undo mark" })}</button><button type="button" disabled={!markup.canUndo} className={button} onClick={markup.clear}>{t("editor.present.clearMarks", { defaultValue: "Clear marks" })}</button>
    {markup.tool === "pen" && <span className="text-xs text-white/45">{t("editor.present.temporaryInk", { defaultValue: "Marks clear when you change page" })}</span>}
  </div>;
}
