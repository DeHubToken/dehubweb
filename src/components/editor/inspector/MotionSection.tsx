import { useDraftState } from "@/hooks/use-draft-state";
/**
 * Motion: keyframes for a layer's position, size, rotation and transparency,
 * and the curve each keyframe eases out with. Lives in its own inspector tab.
 *
 * A property is either static or animated. Turning the stopwatch on drops a
 * first key at the playhead; from then on any change to that property (here,
 * in the Layer controls, or by dragging on the canvas) writes a key at the
 * playhead instead of a new static value. Record mode does the same for
 * properties that are not animated yet, so the beginner's path is simply:
 * press Record, move the playhead, move the layer.
 */
import { useRef } from "react";
import { useEditorControlGesture } from "@/components/editor/useEditorControlGesture";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Diamond, Plus, Timer, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import { EASE_PRESETS, type Clip, type Ease, type EasePreset, type KeyframeProp } from "@/lib/editor/types";
import { placementPatchAt } from "@/lib/editor/render";
import {
  DEFAULT_EASE, KEY_EPSILON, activeKeyTime, applyEase, bezierOf, easeAt, isAnimated, keyAllAt, keyAt, keyTimes,
  keyframeProps, keysOf, propAt, removeKey, removeKeysAt, retimeKey, setEaseAt, setKey, stopAnimatingPatch,
} from "@/lib/editor/keyframes";

export function MotionSection({ clip }: { clip: Clip }) {
  const { t } = useTranslation();
  const now = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);
  const patchClip = useEditorStore((s) => s.patchClip);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const gesture = useEditorControlGesture(clip.id);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const recording = useEditorUiStore((s) => s.recordMotion);
  const setRecording = useEditorUiStore((s) => s.setRecordMotion);

  const props = keyframeProps(clip);
  if (!props.length) return null;

  const local = now - clip.start;
  const inside = local >= -KEY_EPSILON && local <= clip.duration + KEY_EPSILON;
  const animated = isAnimated(clip);
  const times = keyTimes(clip);
  const keyHere = times.some((k) => Math.abs(k - local) < KEY_EPSILON);
  const curveAt = animated ? activeKeyTime(clip, local) : null;
  const curveTo = curveAt === null ? null : times.find((k) => k > curveAt + KEY_EPSILON) ?? null;
  const ease = curveAt !== null ? easeAt(clip, curveAt) : DEFAULT_EASE;
  const animatedProps = props.filter((p) => isAnimated(clip, p));

  const labels: Record<KeyframeProp, string> = {
    x: t("editor.motion.posX"),
    y: t("editor.motion.posY"),
    scale: t("editor.motion.size"),
    rotation: t("editor.motion.rotation"),
    opacity: t("editor.motion.opacity"),
  };

  /** Shown value and its unit; stored values are normalised. */
  const display = (p: KeyframeProp, v: number) =>
    p === "x" ? Math.round(v * settings.width)
      : p === "y" ? Math.round(v * settings.height)
        : p === "rotation" ? Math.round(v * 10) / 10
          : Math.round(v * 100);
  const fromDisplay = (p: KeyframeProp, n: number) =>
    p === "x" ? n / settings.width : p === "y" ? n / settings.height : p === "rotation" ? n : n / 100;
  const unit = (p: KeyframeProp) => (p === "x" || p === "y" ? "px" : p === "rotation" ? "°" : "%");
  const clampValue = (p: KeyframeProp, v: number) =>
    p === "opacity" ? Math.max(0, Math.min(1, v)) : p === "scale" ? Math.max(0.02, Math.min(20, v)) : v;

  const seek = (keyLocal: number) => {
    setIsPlaying(false);
    setCurrentTime(clip.start + keyLocal);
  };

  const toggleStopwatch = (p: KeyframeProp) => {
    if (isAnimated(clip, p)) patchClip(clip.id, stopAnimatingPatch(clip, p, now));
    else patchClip(clip.id, { keyframes: setKey(clip, p, Math.max(0, local), propAt(clip, p, now)) });
  };

  const toggleKey = (p: KeyframeProp) => {
    if (keyAt(clip, p, local)) patchClip(clip.id, { keyframes: removeKey(clip, p, local) });
    else patchClip(clip.id, { keyframes: setKey(clip, p, local, propAt(clip, p, now)) });
  };

  const setValue = (p: KeyframeProp, n: number) => {
    if (!Number.isFinite(n)) return;
    patchClip(clip.id, placementPatchAt(clip, { [p]: clampValue(p, fromDisplay(p, n)) }, now, { record: recording }));
  };

  /** Drag a property's name left or right to change it, like a slider you cannot miss. */
  const scrub = (p: KeyframeProp) => (e: React.PointerEvent) => {
    if (e.button !== 0 || (!inside && isAnimated(clip, p))) return;
    e.preventDefault();
    if (!gesture.begin(() => window.removeEventListener("pointermove", move))) return;
    const x0 = e.clientX;
    const v0 = propAt(clip, p, now);
    const per = p === "x" ? 1 / settings.width : p === "y" ? 1 / settings.height : p === "rotation" ? 0.5 : 0.005;
    let began = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!began && Math.abs(dx) < 2) return;
      if (!gesture.isCurrent()) return;
      began = true;
      const cur = latestClip(clip.id);
      if (!cur) return;
      const v = clampValue(p, v0 + dx * per * (ev.shiftKey ? 10 : 1));
      patchClipLive(clip.id, placementPatchAt(cur, { [p]: v }, useEditorStore.getState().currentTime, { record: useEditorUiStore.getState().recordMotion }));
    };
    window.addEventListener("pointermove", move);
  };

  const prevKey = (p: KeyframeProp) => [...keysOf(clip, p)].reverse().find((k) => k.t < local - KEY_EPSILON);
  const nextKey = (p: KeyframeProp) => keysOf(clip, p).find((k) => k.t > local + KEY_EPSILON);

  const iconBtn = "flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/50 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25";
  const fmt = (s: number) => `${s.toFixed(2)}s`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRecording(!recording)}
          aria-pressed={recording}
          title={t("editor.motion.recordHint")}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition",
            recording ? "border-red-400/50 bg-red-500/15 text-red-200" : "border-white/15 text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", recording ? "animate-pulse bg-red-400" : "bg-red-400/70")} aria-hidden />
          {t("editor.motion.record")}
        </button>
        <div className="flex-1" />
        {keyHere && (
          <button type="button" className={iconBtn} title={t("editor.motion.removeKey")} aria-label={t("editor.motion.removeKey")}
            onClick={() => patchClip(clip.id, { keyframes: removeKeysAt(clip, local) })}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          disabled={!inside}
          onClick={() => patchClip(clip.id, { keyframes: keyAllAt(clip, now) })}
          title={t("editor.motion.addKeyShortcut")}
          className="flex h-7 items-center gap-1 rounded-md bg-white px-2.5 text-[11px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-30"
        >
          <Plus className="h-3 w-3" /> {t("editor.motion.addKey")}
        </button>
      </div>

      {recording ? (
        <p className="rounded-md border border-red-400/20 bg-red-500/[0.06] px-2 py-1.5 text-[10px] leading-snug text-red-100/80">{t("editor.motion.recordHint")}</p>
      ) : !animated ? (
        <p className="text-[10px] leading-snug text-white/45">{t("editor.motion.hint")}</p>
      ) : null}
      {animated && !inside && <p className="text-[10px] leading-snug text-amber-200/70">{t("editor.motion.outside")}</p>}

      <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
        {props.map((p) => {
          const on = isAnimated(clip, p);
          const here = on && !!keyAt(clip, p, local);
          const prev = on ? prevKey(p) : undefined;
          const next = on ? nextKey(p) : undefined;
          return (
            <div key={p} className="flex h-8 items-center gap-0.5 px-1">
              <button
                type="button"
                onClick={() => toggleStopwatch(p)}
                disabled={!inside && !on}
                aria-pressed={on}
                title={on ? t("editor.motion.stopAnimating") : t("editor.motion.animate")}
                aria-label={on ? t("editor.motion.stopAnimating") : t("editor.motion.animate")}
                className={cn(iconBtn, on && "text-sky-300 hover:text-sky-200")}
              >
                <Timer className="h-3.5 w-3.5" />
              </button>
              <span
                onPointerDown={scrub(p)}
                title={t("editor.motion.scrub")}
                className="min-w-0 flex-1 cursor-ew-resize touch-none select-none truncate px-1 text-[11px] text-white/75 hover:text-white"
              >
                {labels[p]}
              </span>
              {on && (
                <>
                  <button type="button" className={iconBtn} disabled={!prev} onClick={() => prev && seek(prev.t)}
                    title={t("editor.motion.prevKey")} aria-label={t("editor.motion.prevKey")}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className={iconBtn} disabled={!inside} onClick={() => toggleKey(p)}
                    title={here ? t("editor.motion.removeKey") : t("editor.motion.addKey")}
                    aria-label={here ? t("editor.motion.removeKey") : t("editor.motion.addKey")}>
                    <Diamond className={cn("h-3 w-3", here ? "fill-sky-300 text-sky-300" : "")} />
                  </button>
                  <button type="button" className={iconBtn} disabled={!next} onClick={() => next && seek(next.t)}
                    title={t("editor.motion.nextKey")} aria-label={t("editor.motion.nextKey")}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <label className={cn(
                "ml-0.5 flex w-[68px] shrink-0 items-center rounded border bg-white/5 pr-1.5 focus-within:ring-1 focus-within:ring-white/30",
                here ? "border-sky-300/40" : "border-white/10",
              )}>
                <MotionValue
                  type="text"
                  inputMode="decimal"
                  draftScope={`editor:motion:${clip.id}:${p}:${local}`}
                  key={`${clip.id}:${p}:${local}:${display(p, propAt(clip, p, now))}`}
                  initialValue={String(display(p, propAt(clip, p, now)))}
                  disabled={on && !inside}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n !== display(p, propAt(clip, p, now))) setValue(p, n);
                  }}
                  className="h-6 w-full min-w-0 bg-transparent px-1.5 text-right text-[11px] tabular-nums text-white outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label={labels[p]}
                />
                <span className="text-[10px] text-white/40">{unit(p)}</span>
              </label>
            </div>
          );
        })}
      </div>

      {animatedProps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.motion.lanes")}</p>
          <div className="space-y-1 rounded-lg border border-white/10 bg-white/[0.02] p-1.5">
            {animatedProps.map((p) => (
              <KeyLane
                key={p}
                clip={clip}
                prop={p}
                label={labels[p]}
                local={local}
                segment={curveAt !== null && curveTo !== null ? [curveAt, curveTo] : null}
                onSeek={seek}
              />
            ))}
          </div>
        </div>
      )}

      {animated && times.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.motion.curve")}</p>
            {curveAt !== null && curveTo !== null && (
              <p className="text-[10px] tabular-nums text-sky-200/80">{t("editor.motion.segment", { from: fmt(curveAt), to: fmt(curveTo) })}</p>
            )}
          </div>
          {curveAt === null || curveTo === null ? (
            <p className="text-[10px] leading-snug text-white/40">{t("editor.motion.noCurve")}</p>
          ) : (
            <>
              <CurveEditor
                ease={ease}
                onLive={(e) => patchClipLive(clip.id, { keyframes: setEaseAt(latestClip(clip.id) ?? clip, curveAt, e) })}
              />
              <p className="text-[10px] leading-snug text-white/40">{t("editor.motion.curveHint")}</p>
            </>
          )}
          <div className="grid grid-cols-3 gap-1">
            {EASE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={curveAt === null || curveTo === null}
                onClick={() => patchClip(clip.id, { keyframes: setEaseAt(clip, curveAt, preset) })}
                title={t(`editor.motion.ease.${preset}`)}
                aria-pressed={ease === preset}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-left transition disabled:opacity-30",
                  ease === preset ? "border-sky-300/60 bg-sky-400/10 text-white" : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <EaseThumb ease={preset} />
                <span className="line-clamp-2 min-w-0 text-[9px] leading-tight">{t(`editor.motion.ease.${preset}`)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => patchClip(clip.id, { keyframes: setEaseAt(clip, null, ease) })}
            className="flex h-7 w-full items-center justify-center rounded-md border border-white/10 text-[11px] text-white/70 hover:bg-white/5 hover:text-white"
          >
            {t("editor.motion.applyAll")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One property's keys across the clip, like a row of a motion tool's dope
 * sheet. Click to move the playhead, drag a key to retime it, double-click a
 * key to delete it. The segment whose curve is being edited is tinted.
 */
function KeyLane({ clip, prop, label, local, segment, onSeek }: {
  clip: Clip;
  prop: KeyframeProp;
  label: string;
  local: number;
  segment: [number, number] | null;
  onSeek: (keyLocal: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useEditorControlGesture(clip.id);
  const dur = Math.max(0.01, clip.duration);
  const pct = (s: number) => `${Math.max(0, Math.min(1, s / dur)) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur * 100) / 100;
  };

  const onKeyDown = (kt: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!gesture.begin(() => window.removeEventListener("pointermove", move))) return;
    onSeek(kt);
    const x0 = e.clientX;
    let from = kt;
    let began = false;
    const move = (ev: PointerEvent) => {
      if (!began && Math.abs(ev.clientX - x0) < 3) return;
      const s = useEditorStore.getState();
      if (!gesture.isCurrent()) return;
      began = true;
      const cur = latestClip(clip.id);
      if (!cur) return;
      const to = timeAt(ev.clientX);
      if (Math.abs(to - from) < 0.005) return;
      s.patchClipLive(clip.id, { keyframes: retimeKey(cur, prop, from, to) });
      s.setCurrentTime(cur.start + to);
      from = to;
    };
    window.addEventListener("pointermove", move);
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 truncate text-[10px] text-white/50">{label}</span>
      <div
        ref={ref}
        onPointerDown={(e) => onSeek(timeAt(e.clientX))}
        className="relative h-5 flex-1 cursor-pointer rounded bg-white/[0.04]"
      >
        {segment && (
          <div className="absolute inset-y-0 bg-sky-400/10" style={{ left: pct(segment[0]), width: `calc(${pct(segment[1])} - ${pct(segment[0])})` }} />
        )}
        <div className="absolute inset-y-0 w-px bg-red-400/80" style={{ left: pct(local) }} />
        {keysOf(clip, prop).map((k) => {
          const here = Math.abs(k.t - local) < KEY_EPSILON;
          return (
            <div
              key={k.t}
              onPointerDown={onKeyDown(k.t)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const cur = latestClip(clip.id);
                if (cur) useEditorStore.getState().patchClip(clip.id, { keyframes: removeKey(cur, prop, k.t) });
              }}
              title={t("editor.motion.timelineKey")}
              className={cn(
                "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize touch-none rounded-[1px] border",
                here ? "border-sky-100 bg-sky-300" : "border-black/60 bg-white hover:bg-sky-200",
              )}
              style={{ left: pct(k.t) }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Latest copy of a clip, for live gestures that outlive a render. */
function latestClip(id: string): Clip | undefined {
  return useEditorStore.getState().clips.find((c) => c.id === id);
}

// ── Curve drawing ──
// Curves are drawn in a box whose y runs from -0.5 to 1.5, so the overshoot of
// the "back" eases stays visible.
const Y_MIN = -0.5;
const Y_MAX = 1.5;

function curvePath(ease: Ease, w: number, h: number, pad: number): string {
  const X = (x: number) => pad + x * (w - pad * 2);
  const Y = (y: number) => pad + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (h - pad * 2);
  if (ease === "hold") return `M${X(0)},${Y(0)} H${X(1)} V${Y(1)}`;
  const pts: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const p = i / 32;
    pts.push(`${i ? "L" : "M"}${X(p).toFixed(1)},${Y(applyEase(ease, p)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function EaseThumb({ ease }: { ease: EasePreset }) {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" aria-hidden>
      <path d={curvePath(ease, 32, 32, 3)} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/80" />
    </svg>
  );
}

/** Cubic-bezier editor: drag the two handles to shape the curve. */
function CurveEditor({ ease, onLive }: { ease: Ease; onLive: (e: Ease) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const gesture = useEditorControlGesture();
  const S = 200;
  const P = 14;
  const X = (x: number) => P + x * (S - P * 2);
  const Y = (y: number) => P + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (S - P * 2);
  const b = bezierOf(ease) ?? (ease === "hold" ? null : [0, 0, 1, 1]);

  const drag = (handle: 0 | 1) => (e: React.PointerEvent) => {
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (!gesture.begin(() => window.removeEventListener("pointermove", move))) return;
    const start = [...b] as [number, number, number, number];
    const move = (ev: PointerEvent) => {
      if (!gesture.isCurrent()) return;
      const svg = ref.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, ((ev.clientX - r.left) / r.width * S - P) / (S - P * 2)));
      const y = Math.max(Y_MIN, Math.min(Y_MAX, Y_MIN + (1 - ((ev.clientY - r.top) / r.height * S - P) / (S - P * 2)) * (Y_MAX - Y_MIN)));
      const next = [...start] as [number, number, number, number];
      next[handle * 2] = Math.round(x * 100) / 100;
      next[handle * 2 + 1] = Math.round(y * 100) / 100;
      onLive(next);
    };
    window.addEventListener("pointermove", move);
  };

  return (
    <div className="space-y-1">
      <svg ref={ref} viewBox={`0 0 ${S} ${S}`} className="aspect-square w-full touch-none rounded-md border border-white/10 bg-black/40">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={`v${g}`} x1={X(g)} x2={X(g)} y1={Y(Y_MIN)} y2={Y(Y_MAX)} stroke="white" strokeOpacity={0.05} />
        ))}
        <line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} stroke="white" strokeOpacity={0.15} />
        <line x1={X(0)} x2={X(1)} y1={Y(1)} y2={Y(1)} stroke="white" strokeOpacity={0.15} />
        <path d={curvePath(ease, S, S, P)} fill="none" stroke="white" strokeWidth={2} />
        {b && (
          <>
            <line x1={X(0)} y1={Y(0)} x2={X(b[0])} y2={Y(b[1])} stroke="#7dd3fc" strokeOpacity={0.6} />
            <line x1={X(1)} y1={Y(1)} x2={X(b[2])} y2={Y(b[3])} stroke="#7dd3fc" strokeOpacity={0.6} />
            <circle cx={X(b[0])} cy={Y(b[1])} r={6} fill="#7dd3fc" className="cursor-grab" onPointerDown={drag(0)} />
            <circle cx={X(b[2])} cy={Y(b[3])} r={6} fill="#7dd3fc" className="cursor-grab" onPointerDown={drag(1)} />
          </>
        )}
        <circle cx={X(0)} cy={Y(0)} r={3} fill="white" />
        <circle cx={X(1)} cy={Y(1)} r={3} fill="white" />
      </svg>
      {b && (
        <p className="text-center font-mono text-[10px] tabular-nums text-white/40">
          {b.map((n) => n.toFixed(2)).join(", ")}
        </p>
      )}
    </div>
  );
}

function MotionValue({ draftScope, initialValue, onBlur, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { draftScope: string; initialValue: string }) {
  const [text, setText] = useDraftState(draftScope, initialValue);
  return <input {...props} value={text} onChange={event => setText(event.target.value)} onBlur={event => {
    if (!text.trim() || !Number.isFinite(Number(text))) return;
    if (Number(text) !== Number(initialValue)) onBlur?.(event);
    setText.complete(text, text);
  }} />;
}
