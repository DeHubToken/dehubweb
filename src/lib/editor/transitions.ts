/**
 * Transitions library shared by the live compositor and the export pipeline.
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import type { Clip, Transition, TransitionKind } from "./types";

export const TRANSITION_OPTIONS: { kind: TransitionKind; label: string }[] = [
  { kind: "fade", label: "Cross-dissolve" },
  { kind: "slide-left", label: "Slide left" },
  { kind: "slide-right", label: "Slide right" },
  { kind: "wipe-left", label: "Wipe left" },
  { kind: "wipe-right", label: "Wipe right" },
];

export const DEFAULT_TRANSITION_DURATION = 0.5;
export const MAX_TRANSITION_DURATION = 3;
export const MIN_TRANSITION_DURATION = 0.1;

/** Find the clip starting (within 1ms) at this clip's end on the same track. */
export function findAdjacentNext(clip: Clip, all: Clip[]): Clip | null {
  const end = clip.start + clip.duration;
  let best: Clip | null = null;
  let bestGap = Infinity;
  for (const c of all) {
    if (c.id === clip.id) continue;
    if (c.trackId !== clip.trackId) continue;
    const gap = Math.abs(c.start - end);
    if (gap < 0.001 && gap < bestGap) {
      best = c;
      bestGap = gap;
    }
  }
  return best;
}

/** Find the clip whose end touches this clip's start on the same track. */
export function findAdjacentPrev(clip: Clip, all: Clip[]): Clip | null {
  for (const c of all) {
    if (c.id === clip.id) continue;
    if (c.trackId !== clip.trackId) continue;
    if (Math.abs(c.start + c.duration - clip.start) < 0.001) return c;
  }
  return null;
}

/** Maximum transition duration allowed between two adjacent clips (capped at half of each). */
export function maxTransitionFor(a: Clip, b: Clip): number {
  return Math.min(MAX_TRANSITION_DURATION, a.duration * 0.5, b.duration * 0.5);
}

export interface RenderOp {
  clip: Clip;
  /** Local media time override (for incoming-transition pre-roll). */
  localTimeOverride?: number;
  alpha: number;
  translateX: number; // pixels in canvas space
  clipRect?: { x: number; w: number };
}

interface PairContext { canvasWidth: number; }

/** Outgoing-side per-frame styling. */
export function outgoingOps(
  clip: Clip,
  tr: Transition,
  progress: number,
  ctx: PairContext,
): Pick<RenderOp, "alpha" | "translateX" | "clipRect"> {
  const p = Math.max(0, Math.min(1, progress));
  const W = ctx.canvasWidth;
  switch (tr.kind) {
    case "fade":
      return { alpha: 1 - p, translateX: 0 };
    case "slide-left":
      return { alpha: 1, translateX: -p * W };
    case "slide-right":
      return { alpha: 1, translateX: p * W };
    case "wipe-left":
      return { alpha: 1, translateX: 0, clipRect: { x: 0, w: W * (1 - p) } };
    case "wipe-right":
      return { alpha: 1, translateX: 0, clipRect: { x: W * p, w: W * (1 - p) } };
    default:
      return { alpha: 1, translateX: 0 };
  }
}

/** Incoming-side per-frame styling. */
export function incomingOps(
  clip: Clip,
  tr: Transition,
  progress: number,
  ctx: PairContext,
): Pick<RenderOp, "alpha" | "translateX" | "clipRect"> {
  const p = Math.max(0, Math.min(1, progress));
  const W = ctx.canvasWidth;
  switch (tr.kind) {
    case "fade":
      return { alpha: p, translateX: 0 };
    case "slide-left":
      return { alpha: 1, translateX: (1 - p) * W };
    case "slide-right":
      return { alpha: 1, translateX: -(1 - p) * W };
    case "wipe-left":
      return { alpha: 1, translateX: 0, clipRect: { x: W * (1 - p), w: W * p } };
    case "wipe-right":
      return { alpha: 1, translateX: 0, clipRect: { x: 0, w: W * p } };
    default:
      return { alpha: 1, translateX: 0 };
  }
}

/** Compute every clip render-op for a given timeline time. */
export function computeRenderOps(
  clips: Clip[],
  trackIsVisual: (trackId: string) => boolean,
  t: number,
  canvasWidth: number,
): RenderOp[] {
  const ops: RenderOp[] = [];
  const allOnVisualTracks = clips.filter((c) => trackIsVisual(c.trackId));

  for (const C of allOnVisualTracks) {
    const active = t >= C.start && t < C.start + C.duration;
    const tr = C.transitionOut;
    const d = tr?.duration ?? 0;
    const outgoingStart = C.start + C.duration - d;
    const isOutgoing = !!tr && d > 0 && t >= outgoingStart && t < C.start + C.duration;

    if (active && isOutgoing && tr) {
      const p = (t - outgoingStart) / d;
      const styling = outgoingOps(C, tr, p, { canvasWidth });
      ops.push({ clip: C, ...styling });
    } else if (active) {
      ops.push({ clip: C, alpha: 1, translateX: 0 });
    }

    // Is C the incoming side of a previous clip's transitionOut?
    const prev = findAdjacentPrev(C, allOnVisualTracks);
    if (prev?.transitionOut && prev.transitionOut.duration > 0) {
      const dd = prev.transitionOut.duration;
      const winStart = C.start - dd;
      const winEnd = C.start;
      if (t >= winStart && t < winEnd) {
        const p = (t - winStart) / dd;
        const styling = incomingOps(C, prev.transitionOut, p, { canvasWidth });
        const localTimeOverride =
          C.kind === "text" || C.kind === "image"
            ? undefined
            : (t - winStart) + C.trimIn;
        ops.push({ clip: C, localTimeOverride, ...styling });
      }
    }
  }
  return ops;
}
