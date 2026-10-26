/**
 * useShortsSideGestures
 * =====================
 * The left and right thirds of a short on a phone, matching the app:
 *
 * - hold on the right plays at 2x, hold on the left rewinds;
 * - while holding, a drag down locks that speed on after the finger lifts,
 *   faster the further it goes; the next tap turns it off;
 * - a double tap jumps 10s back or forward, and more taps keep jumping.
 *
 * The middle third is left to `useTapGestures` (Like ladder, hold for the
 * tray). Nothing here calls `preventDefault`: the viewer's vertical pager runs
 * on the same pointer stream and ignores drags while `onHoldChange` says a
 * hold owns the finger.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { HOLD_BASE_RATE, REWIND_TICK_MS, SEEK_JUMP_SECONDS, heldRate, seekSideAt } from '@/lib/video-hold-gestures';

/** Same timings as useTapGestures, so both halves of the frame feel alike. */
const TAP_WINDOW_MS = 360;
const LONG_PRESS_MS = 400;
const MOVE_SLOP_PX = 14;

type PointerHandlers = {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
};

function isMediaControl(target: EventTarget | null) {
  return !!(target as HTMLElement | null)?.closest?.(
    'button, a, input, textarea, [role="button"], [data-video-controls]',
  );
}

export interface ShortsSideGesturesOptions {
  enabled: boolean;
  isActive: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The viewer's chosen rate, which a hold returns to. */
  playbackRate: number;
  onSingleTap?: (event: React.PointerEvent) => void;
  onUndoSingleTap?: () => void;
  onHoldChange?: (active: boolean) => void;
}

export function useShortsSideGestures(
  centre: PointerHandlers,
  { enabled, isActive, videoRef, playbackRate, onSingleTap, onUndoSingleTap, onHoldChange }: ShortsSideGesturesOptions,
) {
  const origin = useRef<{ x: number; y: number; id: number; side: -1 | 1 } | null>(null);
  /** The pointer stream belongs to the middle third's handlers. */
  const toCentre = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewindTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const taps = useRef(0);
  const held = useRef<{ side: -1 | 1; wasPlaying: boolean; locked: boolean; rate: number } | null>(null);
  /** A hold left running by a drag down, until the next tap. */
  const locked = useRef<{ side: -1 | 1; wasPlaying: boolean } | null>(null);
  /** The tap that turns a locked hold off does nothing else. */
  const swallow = useRef<number | null>(null);
  const seekRun = useRef<{ side: -1 | 1; total: number } | null>(null);
  const [seekFlash, setSeekFlash] = useState<{ side: -1 | 1; total: number; run: number } | null>(null);
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const stopRewind = useCallback(() => {
    if (rewindTimer.current) clearInterval(rewindTimer.current);
    rewindTimer.current = null;
  }, []);

  const applyRate = useCallback((side: -1 | 1, rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (side > 0) {
      video.playbackRate = rate;
      return;
    }
    // Browsers cannot reliably play backwards, so a rewind pauses and steps.
    stopRewind();
    video.pause();
    rewindTimer.current = setInterval(() => {
      const current = videoRef.current;
      if (current) current.currentTime = Math.max(0, current.currentTime - rate * REWIND_TICK_MS / 1000);
    }, REWIND_TICK_MS);
  }, [videoRef, stopRewind]);

  const endHold = useCallback((side: -1 | 1, wasPlaying: boolean) => {
    const video = videoRef.current;
    if (side > 0) {
      if (video) video.playbackRate = playbackRateRef.current;
      return;
    }
    stopRewind();
    if (video && wasPlaying && isActive) void video.play().catch(() => {});
  }, [videoRef, stopRewind, isActive]);

  const clearTimers = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    holdTimer.current = null;
    tapTimer.current = null;
  }, []);

  // Leaving the short, or the viewer, drops anything still running.
  useEffect(() => {
    if (isActive) return;
    const hold = held.current ?? locked.current;
    if (hold) endHold(hold.side, false);
    if (held.current) onHoldChange?.(false);
    held.current = null;
    locked.current = null;
  }, [isActive, endHold, onHoldChange]);
  useEffect(() => () => { clearTimers(); stopRewind(); }, [clearTimers, stopRewind]);

  const jump = useCallback((side: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    const run = seekRun.current?.side === side ? seekRun.current : { side, total: 0 };
    run.total += SEEK_JUMP_SECONDS;
    seekRun.current = run;
    const next = video.currentTime + side * SEEK_JUMP_SECONDS;
    const end = Number.isFinite(video.duration) ? video.duration - 0.25 : next;
    video.currentTime = Math.max(0, Math.min(end, next));
    setSeekFlash({ side, total: run.total, run: Date.now() });
  }, [videoRef]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (!enabled) { centre.onPointerDown(event); return; }
    if (locked.current) {
      endHold(locked.current.side, locked.current.wasPlaying);
      locked.current = null;
      swallow.current = event.pointerId;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const side = isMediaControl(event.target) ? 0 : seekSideAt(event.clientX - rect.left, rect.width);
    toCentre.current = side === 0;
    if (side === 0) { centre.onPointerDown(event); return; }
    origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId, side };
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      const video = videoRef.current;
      if (!video || !origin.current) return;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      taps.current = 0;
      seekRun.current = null;
      held.current = { side, wasPlaying: !video.paused, locked: false, rate: HOLD_BASE_RATE };
      onHoldChange?.(true);
      applyRate(side, HOLD_BASE_RATE);
    }, LONG_PRESS_MS);
  }, [enabled, centre, endHold, videoRef, onHoldChange, applyRate]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!enabled || toCentre.current) { centre.onPointerMove(event); return; }
    const from = origin.current;
    if (!from || from.id !== event.pointerId) return;
    const hold = held.current;
    if (hold) {
      const { rate, locked: lock } = heldRate(event.clientY - from.y);
      hold.locked = lock;
      if (rate !== hold.rate) {
        hold.rate = rate;
        applyRate(hold.side, rate);
      }
      return;
    }
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > MOVE_SLOP_PX) {
      // A swipe, not a tap or a hold: the pager has it.
      origin.current = null;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, [enabled, centre, applyRate]);

  const finishHold = useCallback(() => {
    const hold = held.current;
    if (!hold) return false;
    held.current = null;
    onHoldChange?.(false);
    if (hold.locked) locked.current = { side: hold.side, wasPlaying: hold.wasPlaying };
    else endHold(hold.side, hold.wasPlaying);
    return true;
  }, [onHoldChange, endHold]);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (swallow.current === event.pointerId) { swallow.current = null; return; }
    if (!enabled || toCentre.current) { toCentre.current = false; centre.onPointerUp(event); return; }
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    const from = origin.current;
    origin.current = null;
    if (finishHold()) return;
    if (!from || from.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > MOVE_SLOP_PX) return;

    taps.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      taps.current = 0;
      seekRun.current = null;
    }, TAP_WINDOW_MS);
    if (taps.current === 1) {
      // Reversible (it shows or hides the buttons), so it acts at once.
      onSingleTap?.(event);
      return;
    }
    if (taps.current === 2) onUndoSingleTap?.();
    const rect = event.currentTarget.getBoundingClientRect();
    jump(seekSideAt(event.clientX - rect.left, rect.width) || from.side);
  }, [enabled, centre, finishHold, onSingleTap, onUndoSingleTap, jump]);

  const onPointerCancel = useCallback((event: React.PointerEvent) => {
    if (swallow.current === event.pointerId) swallow.current = null;
    if (!enabled || toCentre.current) { toCentre.current = false; centre.onPointerCancel(event); return; }
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    origin.current = null;
    finishHold();
  }, [enabled, centre, finishHold]);

  return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, seekFlash };
}
