import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { bringIntoViewAndFlash } from '@/lib/focus-scroll';

/** How long to wait for the tagged line to arrive with the room's history. */
const WAIT_MS = 8000;
const POLL_MS = 250;

/** The DOM id every chat row carries, so a notification can find its line. */
export const chatMessageDomId = (id: string) => `chat-msg-${id}`;

/**
 * Bring the chat line a mention notification named (`?chatMessage=<id>`) into
 * view and flash it. The room loads its history after mount, so this waits for
 * the row to exist instead of looking once. Gives up quietly: a line that has
 * scrolled out of the loaded history still leaves the reader in the right room.
 */
export function useFocusChatMessage(enabled = true) {
  const { search } = useLocation();
  const target = new URLSearchParams(search).get('chatMessage');

  useEffect(() => {
    if (!enabled || !target) return;
    let stop: (() => void) | undefined;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.getElementById(chatMessageDomId(target));
      if (el) {
        window.clearInterval(timer);
        stop = bringIntoViewAndFlash(el);
      } else if (Date.now() - started > WAIT_MS) {
        window.clearInterval(timer);
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      stop?.();
    };
  }, [enabled, target]);
}
