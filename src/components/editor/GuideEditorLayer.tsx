import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { editDesignGuide, getDesignGuides, type GuideAxis } from "@/lib/editor/designGuides";

export function GuideEditorLayer({ active, disabled, rulers, surface, width, height, scale, projectId, onActivate }: {
  active: boolean; disabled: boolean; rulers: boolean; surface: RefObject<HTMLDivElement>; width: number; height: number; scale: number; projectId: string; onActivate: () => void;
}) {
  const { t } = useTranslation();
  const value = useEditorStore(store => store.settings.guides), guides = getDesignGuides(value);
  const [pending, setPending] = useState<{ axis: GuideAxis; from: number | null; position: number; inside: boolean } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cleanupRef.current?.(); }; }, []);
  useEffect(() => { cleanupRef.current?.(); }, [projectId, width, height, scale]);
  useEffect(() => { if (!active || disabled) cleanupRef.current?.(); }, [active, disabled]);
  const update = (axis: GuideAxis, from: number | null, to: number | null) => {
    const store = useEditorStore.getState(); if (store.projectId !== projectId) return;
    const before = store.toSnapshot(), next = editDesignGuide(before, axis, from, to);
    if (next !== before) store.applyDesignEdit(before, next);
  };
  const start = (axis: GuideAxis, from: number | null, event: ReactPointerEvent<Element>) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault(); event.stopPropagation(); cleanupRef.current?.(); onActivate();
    const store = useEditorStore.getState(), rect = surface.current?.getBoundingClientRect();
    if (store.projectId !== projectId || !rect || rect.width <= 0 || rect.height <= 0) return;
    const before = store.toSnapshot(), lease = store.holdEdits(), pointer = event.pointerId, startX = event.clientX, startY = event.clientY;
    let last = { axis, from, position: from ?? (axis === "vertical" ? (startX - rect.left) / rect.width : (startY - rect.top) / rect.height), inside: false };
    const position = (x: number, y: number) => {
      const point = from === null ? axis === "vertical" ? (x - rect.left) / rect.width : (y - rect.top) / rect.height : from + (axis === "vertical" ? (x - startX) / rect.width : (y - startY) / rect.height);
      last = { axis, from, position: point, inside: x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && point >= 0 && point <= 1 };
      if (mounted.current) setPending(last);
    };
    const move = (event: PointerEvent) => { if (event.pointerId === pointer && lease.isCurrent()) position(event.clientX, event.clientY); };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", cancel); cleanupRef.current = null; if (mounted.current) setPending(null); lease.release(); };
    const end = (event: PointerEvent) => { if (event.pointerId !== pointer) return; position(event.clientX, event.clientY); try { if (lease.isCurrent()) { const next = editDesignGuide(before, axis, from, last.inside ? last.position : null); if (next !== before) useEditorStore.getState().applyDesignEdit(before, next); } } finally { cleanup(); } };
    const cancel = (event: PointerEvent) => { if (event.pointerId === pointer) cleanup(); };
    cleanupRef.current = cleanup; position(startX, startY);
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", cancel);
  };
  const rulerKey = (axis: GuideAxis, event: ReactKeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onActivate(); update(axis, null, 0.5); } };
  if (disabled) return null;
  return <div className="pointer-events-none absolute inset-0 z-20 touch-none">
    {rulers && <><div role="button" tabIndex={0} aria-label={t("editor.guides.dragHorizontal", { defaultValue: "Drag down to add a horizontal guide. Press Enter to add a centre guide." })} onKeyDown={event => rulerKey("horizontal", event)} onClick={event => { if (event.detail === 0) { onActivate(); update("horizontal", null, 0.5); } }} onPointerDown={event => start("horizontal", null, event)} className="pointer-events-auto absolute -top-5 left-0 right-0 h-5 cursor-row-resize outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" /><div role="button" tabIndex={0} aria-label={t("editor.guides.dragVertical", { defaultValue: "Drag right to add a vertical guide. Press Enter to add a centre guide." })} onKeyDown={event => rulerKey("vertical", event)} onClick={event => { if (event.detail === 0) { onActivate(); update("vertical", null, 0.5); } }} onPointerDown={event => start("vertical", null, event)} className="pointer-events-auto absolute -left-5 bottom-0 top-0 w-5 cursor-col-resize outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" /></>}
    {active && (["vertical", "horizontal"] as const).flatMap(axis => guides[axis].map(position => {
      const vertical = axis === "vertical", moving = pending?.axis === axis && pending.from === position, dimension = vertical ? width : height;
      return <div key={`${axis}:${position}`} role="slider" tabIndex={0} aria-label={t(`editor.guides.${axis}`, { defaultValue: vertical ? "Vertical guide" : "Horizontal guide" })} aria-valuemin={0} aria-valuemax={dimension} aria-valuenow={Math.round(position * dimension)} aria-valuetext={t("editor.guides.pixelPosition", { defaultValue: "{{position}} pixels", position: Math.round(position * dimension) })} aria-orientation={vertical ? "horizontal" : "vertical"} onPointerDown={event => start(axis, position, event)} onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); update(axis, position, null); }} onKeyDown={event => {
        const negative = vertical ? "ArrowLeft" : "ArrowUp", positive = vertical ? "ArrowRight" : "ArrowDown";
        if (![negative, positive, "Home", "End", "Delete", "Backspace"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const step = (event.shiftKey ? 10 : 1) / dimension;
        update(axis, position, event.key === "Delete" || event.key === "Backspace" ? null : event.key === "Home" ? 0 : event.key === "End" ? 1 : Math.max(0, Math.min(1, position + (event.key === negative ? -step : step))));
      }} className={`pointer-events-auto absolute outline-none focus-visible:bg-cyan-300/15 ${vertical ? "bottom-0 top-0 w-3 -translate-x-1/2 cursor-col-resize" : "left-0 right-0 h-3 -translate-y-1/2 cursor-row-resize"}`} style={vertical ? { left: position * width * scale } : { top: position * height * scale }}>{!moving && <span aria-hidden className={`pointer-events-none absolute bg-cyan-400/80 ${vertical ? "bottom-0 left-1/2 top-0 w-px" : "left-0 right-0 top-1/2 h-px"}`} />}</div>;
    }))}
    {pending?.inside && <div aria-hidden className={`absolute bg-white ${pending.axis === "vertical" ? "bottom-0 top-0 w-px" : "left-0 right-0 h-px"}`} style={pending.axis === "vertical" ? { left: pending.position * width * scale } : { top: pending.position * height * scale }} />}
    {pending && <span role="status" className="absolute left-2 top-2 rounded-lg bg-black/85 px-3 py-2 text-xs text-cyan-100">{pending.inside ? t("editor.guides.pixelPosition", { defaultValue: "{{position}} pixels", position: Math.round(pending.position * (pending.axis === "vertical" ? width : height)) }) : t(pending.from === null ? "editor.guides.dragInside" : "editor.guides.releaseRemove", { defaultValue: pending.from === null ? "Drag onto the page to add a guide" : "Release to remove this guide" })}</span>}
  </div>;
}
