/**
 * "Let me out" — from inside the game.
 * ====================================
 * Every embedded game runs in an iframe sandboxed WITHOUT `allow-same-origin`,
 * so its frame is an opaque origin and the host cannot reach into it: no DOM
 * access, no shared globals, nothing. A `postMessage` is the only channel there
 * is, and this is the host half of it.
 *
 * WHY THE GAMES NEED ONE AT ALL
 * -----------------------------
 * The host already paints an exit control over the frame. It is not enough. Two
 * of these games take a pointer lock, and while the pointer is captured the
 * cursor does not exist as far as the page is concerned — you cannot click a
 * button in the corner because you cannot aim at it. The way out is Escape,
 * which releases the lock and (in the games that have one) opens their own
 * pause menu. At that moment the player is looking at the game's menu, so that
 * is where a way out belongs. Asking someone to press Escape and then hunt for
 * host chrome layered over a fullscreen game is asking them to learn our
 * plumbing.
 *
 * THE MESSAGE
 * -----------
 *   { source: '<game id>', type: 'exit' }
 *
 * `source` is the same discriminator the readiness bridge already uses, so a
 * game that reports `ready` reports `exit` under the same name. It is checked
 * on arrival: any frame on the page can post to us, and an unnamed or
 * unrecognised message must be ignored rather than acted on.
 *
 * The game's button posts and does nothing else — it does not try to tear
 * itself down. The host owns what "leaving" means, which differs by entry
 * point: the Arcade player navigates back to the grid, while the War and
 * Jungle theme launchers unmount an overlay and hand the viewport back to the
 * feed. Both call this with their own handler.
 */

import { useEffect } from 'react';

export interface GameExitMessage {
  source?: string;
  type?: string;
}

/**
 * Run `onExit` when the game identified by `source` asks to be closed.
 *
 * Pass `undefined` for `source` to listen for nothing — the caller may not know
 * which game it is hosting yet.
 */
export function useGameExitRequest(source: string | undefined, onExit: () => void): void {
  useEffect(() => {
    if (!source) return;
    const onMessage = (event: MessageEvent<GameExitMessage | null>) => {
      const data = event.data;
      // Opaque-origin frames post with `origin: "null"`, so the origin check
      // that would normally guard this cannot distinguish our game from any
      // other sandboxed frame. The `source` name does that job instead, and it
      // is why the payload carries one.
      if (!data || data.source !== source || data.type !== 'exit') return;
      onExit();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [source, onExit]);
}
