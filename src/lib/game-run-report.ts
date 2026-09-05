/**
 * "Here is how the run is going" — from inside the game.
 * ======================================================
 * The host half of the run bridge, and the sibling of `game-exit-request`. A
 * game in the arcade runs in an iframe sandboxed WITHOUT `allow-same-origin`,
 * so its frame is an opaque origin and postMessage is the only channel there
 * is. This turns those messages into a run on the server.
 *
 * THE MESSAGES
 * ------------
 *   { source, type: 'run-start' }
 *   { source, type: 'run-progress', progress: 0..1000, life: number }
 *   { source, type: 'run-end',      progress: 0..1000, life: number }
 *
 * `progress` is permille of whatever the game measures itself against — for
 * Street Slayer, the reachable width of the street. `life` is the game's own
 * secondary figure. The host does not interpret either; it relays them and the
 * edge function decides what they were worth.
 *
 * WHY THE HOST RELAYS RATHER THAN THE GAME POSTING DIRECTLY
 * ---------------------------------------------------------
 * The frame has no origin, no cookies and no access to the player's DeHub
 * token, and it must not have any — it is third-party code. So it cannot call
 * an authenticated endpoint, and it should not be able to. The host holds the
 * identity; the game holds the facts; this is the join.
 *
 * WHY event.source IS CHECKED
 * ---------------------------
 * Any script on the page can postMessage to `window`, and an opaque-origin
 * frame posts with `origin: "null"`, so the origin check that would normally
 * guard this cannot tell our game from a console one-liner. Comparing
 * `event.source` against the frame's own `contentWindow` can: a window cannot
 * post as a window it is not. It does not make the endpoint safe — a
 * determined cheat calls it directly and the server's clock is what answers
 * that (see supabase/functions/arcade-score) — but it does close the trivial
 * path of typing a perfect run into a console.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { openRun, reportRun, submitRun, type RunResult } from '@/lib/api/arcade-leaderboard';

interface RunMessage {
  source?: string;
  type?: string;
  progress?: number;
  life?: number;
}

/**
 * Floor on how often a report is relayed, whatever the frame does.
 *
 * Below the game's own sampling interval on purpose. Street Slayer checks its
 * position every 500ms and only posts when it has crossed a checkpoint, so an
 * honest report is never held here — the floor exists for a frame that misbehaves,
 * not for the one we ship.
 *
 * It used to be 1000ms, which is ABOVE that sample, so two checkpoints crossed
 * in one second had the second one silently dropped. That cost nothing when the
 * server scored on the clock alone. It costs a tenth of the run now that the
 * server also asks how much of it was reported, which is why this moved.
 */
const MIN_RELAY_GAP_MS = 400;

export interface GameRunState {
  /** The finished run's standing, once the server has answered. */
  result: RunResult | null;
  /** True between the run ending and the answer arriving. */
  settling: boolean;
  /** Clear the panel — the player is playing again. */
  dismiss: () => void;
}

/**
 * Record runs reported by the game in `frame` under the name `source`.
 *
 * Pass `undefined` for `source` to listen for nothing: the caller may not know
 * which game it is hosting, or may be hosting one with no board. Signed out,
 * every call short-circuits inside the API layer — the run is played, it just
 * is not recorded.
 */
export function useGameRun(
  source: string | undefined,
  game: string,
  frame: RefObject<HTMLIFrameElement>,
  enabled: boolean,
): GameRunState {
  const [result, setResult] = useState<RunResult | null>(null);
  const [settling, setSettling] = useState(false);

  // The open run, as a promise rather than a value: the game starts reporting
  // progress the moment it starts moving, which can be before `start` has come
  // back. Awaiting the same promise keeps those reports rather than dropping
  // them on the floor.
  const runId = useRef<Promise<string | null> | null>(null);
  const lastRelay = useRef(0);
  /** A report the floor above is holding, and the timer that will send it. */
  const queued = useRef<{ progress: number; life: number } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => setResult(null), []);

  useEffect(() => {
    if (!source || !enabled) return;

    /**
     * Send one report. Fire and forget: a run must never stall on the network,
     * and rejections are already swallowed inside the API layer. A report that
     * fails to reach the server does now cost the player something, so the
     * floor above holds reports rather than binning them — but a network
     * failure is still a network failure and the closing report is what
     * carries the final reach either way.
     */
    const relay = (progress: number, life: number) => {
      const pending = runId.current;
      if (!pending) return;
      lastRelay.current = Date.now();
      void pending.then((id) => (id ? reportRun(id, progress, life) : undefined));
    };

    const onMessage = (event: MessageEvent<RunMessage | null>) => {
      const data = event.data;
      if (!data || data.source !== source) return;
      // Only the game frame itself, not any other script on the page.
      if (event.source !== frame.current?.contentWindow) return;

      const progress = Number(data.progress) || 0;
      const life = Number(data.life) || 0;

      if (data.type === 'run-start') {
        setResult(null);
        lastRelay.current = 0;
        // A report held from the previous run belongs to that run's id.
        if (flushTimer.current !== null) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        queued.current = null;
        runId.current = openRun(game);
        return;
      }

      if (data.type === 'run-progress') {
        const now = Date.now();
        const wait = MIN_RELAY_GAP_MS - (now - lastRelay.current);
        if (wait > 0) {
          // Held, not dropped. The server scores partly on how much of the run
          // it was shown, so a report thrown away here comes off the player's
          // final standing — and `progress` is the furthest reached so far, so
          // holding the newest one loses nothing.
          queued.current = { progress, life };
          if (flushTimer.current === null) {
            flushTimer.current = setTimeout(() => {
              flushTimer.current = null;
              const held = queued.current;
              queued.current = null;
              if (held) relay(held.progress, held.life);
            }, wait);
          }
          return;
        }
        relay(progress, life);
        return;
      }

      if (data.type === 'run-end') {
        const pending = runId.current;
        runId.current = null;
        if (!pending) return;
        void pending
          .then((id) => {
            // No id means the run was never opened — signed out, or the
            // endpoint is not deployed yet. Nothing to settle, and showing a
            // "recording your run" beat for a run nothing is recording would
            // be a small lie told on every death.
            if (!id) return null;
            setSettling(true);
            return submitRun(id, progress, life);
          })
          .then((answer) => setResult(answer))
          .finally(() => setSettling(false));
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (flushTimer.current !== null) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      queued.current = null;
    };
  }, [source, game, frame, enabled]);

  return { result, settling, dismiss };
}
