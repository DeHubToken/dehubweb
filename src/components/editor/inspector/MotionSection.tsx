/**
 * Motion: keyframes for a layer's position, size, rotation and transparency,
 * and the curve each keyframe eases out with.
 *
 * A property is either static or animated. Turning the stopwatch on drops a
 * first key at the playhead; from then on any change to that property (here,
 * in the Layer controls, or by dragging on the canvas) writes a key at the
 * playhead instead of a new static value.
 */
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Diamond, Plus, Timer, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { EASE_PRESETS, type Clip, type Ease, type EasePreset, type KeyframeProp } from "@/lib/editor/types";
import { placementPatchAt } from "@/lib/editor/render";
import {
  DEFAULT_EASE, KEY_EPSILON, activeKeyTime, applyEase, bezierOf, easeAt, isAnimated, keyAt, keyTimes,
  keyframeProps, keysOf, propAt, removeKey, removeKeysAt, setEaseAt, setKey, stopAnimatingPatch,
} from "@/lib/editor/keyframes";

export function MotionSection({ clip }: { clip: Clip }) {
  const { t } = useTranslation();
  const now = useEditorStore((s) => s.currentTime);
  const settings = useEditorStore((s) => s.settings);
  const patchClip = useEditorStore((s) => s.patchClip);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);

  const props = keyframeProps(clip);
  if (!props.length) return null;

  const local = now - clip.start;
  const inside = local >= -KEY_EPSILON && local <= clip.duration + KEY_EPSILON;
  const animated = isAnimated(clip);
  const times = keyTimes(clip);
  const keyHere = times.some((k) => Math.abs(k - local) < KEY_EPSILON);
  const curveAt = animated ? activeKeyTime(clip, local) : null;
  const ease = curveAt !== null ? easeAt(clip, curveAt) : DEFAULT_EASE;

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

  /** Key every property at the playhead, holding its current value. */
  const addKeyAll = () => {
    let next: Clip = clip;
    for (const p of props) next = { ...next, keyframes: setKey(next, p, local, propAt(clip, p, now)) } as Clip;
    patchClip(clip.id, { keyframes: next.keyframes });
  };

  const setValue = (p: KeyframeProp, n: number) => {
    if (!Number.isFinite(n)) return;
    patchClip(clip.id, placementPatchAt(clip, { [p]: fromDisplay(p, n) }, now));
  };

  const prevKey = (p: KeyframeProp) => [...keysOf(clip, p)].reverse().find((k) => k.t < local - KEY_EPSILON);
  const nextKey = (p: KeyframeProp) => keysOf(clip, p).find((k) => k.t > local + KEY_EPSILON);

  const iconBtn = "flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/50 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25";

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.motion.title")}</p>
        <div className="flex items-center gap-1">
          {keyHere && (
            <button type="button" className={iconBtn} title={t("editor.motion.removeKey")} aria-label={t("editor.motion.removeKey")}
              onClick={() => patchClip(clip.id, { keyframes: removeKeysAt(clip, local) })}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={!inside}
            onClick={addKeyAll}
            className="flex h-6 items-center gap-1 rounded-md border border-white/15 px-2 text-[10px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Plus className="h-3 w-3" /> {t("editor.motion.addKey")}
          </button>
        </div>
      </div>

      {!animated && <p className="text-[10px] leading-snug text-white/40">{t("editor.motion.hint")}</p>}
      {animated && !inside && <p className="text-[10px] leading-snug text-amber-200/70">{t("editor.motion.outside")}</p>}

      <div className="divide-y divide-white/5 rounded-md border border-white/10 bg-white/[0.02]">
        {props.map((p) => {
          const on = isAnimated(clip, p);
          const here = on && !!keyAt(clip, p, local);
          const prev = on ? prevKey(p) : undefined;
          const next = on ? nextKey(p) : undefined;
          return (
            <div key={p} className="flex h-8 items-center gap-1 px-1">
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
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">{labels[p]}</span>
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
              <label className="flex w-[74px] shrink-0 items-center rounded border border-white/10 bg-white/5 pr-1.5 focus-within:ring-1 focus-within:ring-white/30">
                <input
                  type="number"
                  key={`${p}:${display(p, propAt(clip, p, now))}`}
                  defaultValue={display(p, propAt(clip, p, now))}
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

      {animated && times.length > 1 && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{t("editor.motion.curve")}</p>
          {curveAt === null ? (
            <p className="text-[10px] leading-snug text-white/40">{t("editor.motion.noCurve")}</p>
          ) : (
            <>
              <CurveEditor
                ease={ease}
                onStart={beginGesture}
                onLive={(e) => patchClipLive(clip.id, { keyframes: setEaseAt(latestClip(clip.id) ?? clip, curveAt, e) })}
              />
              <p className="text-[10px] leading-snug text-white/40">{t("editor.motion.curveHint")}</p>
            </>
          )}
          <div className="grid grid-cols-5 gap-1">
            {EASE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={curveAt === null}
                onClick={() => patchClip(clip.id, { keyframes: setEaseAt(clip, curveAt, preset) })}
                title={t(`editor.motion.ease.${preset}`)}
                aria-label={t(`editor.motion.ease.${preset}`)}
                aria-pressed={ease === preset}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border p-1 transition disabled:opacity-30",
                  ease === preset ? "border-sky-300/60 bg-sky-400/10" : "border-white/10 hover:bg-white/5",
                )}
              >
                <EaseThumb ease={preset} />
                <span className="w-full truncate text-center text-[8px] leading-tight text-white/50">{t(`editor.motion.ease.${preset}`)}</span>
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
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
      <path d={curvePath(ease, 32, 32, 3)} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-white/80" />
    </svg>
  );
}

/** Cubic-bezier editor: drag the two handles to shape the curve. */
function CurveEditor({ ease, onStart, onLive }: { ease: Ease; onStart: () => void; onLive: (e: Ease) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const S = 200;
  const P = 14;
  const X = (x: number) => P + x * (S - P * 2);
  const Y = (y: number) => P + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (S - P * 2);
  const b = bezierOf(ease) ?? (ease === "hold" ? null : [0, 0, 1, 1]);

  const drag = (handle: 0 | 1) => (e: React.PointerEvent) => {
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    onStart();
    const start = [...b] as [number, number, number, number];
    const move = (ev: PointerEvent) => {
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
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
