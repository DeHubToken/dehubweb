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

/** Floor on how often a report is relayed, whatever the frame does. */
const MIN_RELAY_GAP_MS = 1000;

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

  const dismiss = useCallback(() => setResult(null), []);

  useEffect(() => {
    if (!source || !enabled) return;

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
        runId.current = openRun(game);
        return;
      }

      if (data.type === 'run-progress') {
        const now = Date.now();
        if (now - lastRelay.current < MIN_RELAY_GAP_MS) return;
        lastRelay.current = now;
        const pending = runId.current;
        if (!pending) return;
        // Fire and forget: a run must never stall on the network, and a
        // dropped report costs the player nothing the closing one cannot make
        // up. Rejections are already swallowed inside the API layer.
        void pending.then((id) => (id ? reportRun(id, progress, life) : undefined));
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
    return () => window.removeEventListener('message', onMessage);
  }, [source, game, frame, enabled]);

  return { result, settling, dismiss };
}
