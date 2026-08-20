/**
 * "Do this on DeHub" — from inside the game.
 * ==========================================
 * The companion to the exit and readiness bridges, and it exists for the same
 * reason: every embedded game runs in an iframe sandboxed WITHOUT
 * `allow-same-origin`, so its frame is an opaque origin. From in there
 * `window.open` is gone, top navigation is gone, and a `fetch` leaves with
 * `Origin: null`, which the API's allowlist — pinned to https://dehub.io — can
 * never match. A `postMessage` is the only channel there is.
 *
 * Trenchstar's desk is three monitors showing DeHub: the feed, your profile,
 * the composer. Clicking one is meant to take you there. That click has to
 * come out through here.
 *
 * THE MESSAGES
 * ------------
 *   { source: '<game id>', type: 'navigate', to: '/app/post/2008' }
 *   { source: '<game id>', type: 'feed', limit: 2 }
 *
 * and the reply to the second, which is the only thing this side ever sends:
 *
 *   { source: 'dehub', type: 'feed', items: [...] }
 *
 * WHAT IS AND IS NOT GRANTED
 * --------------------------
 * The sandbox is the security boundary and this must not become a hole in it.
 * So: `to` is matched against an allowlist of internal paths and anything else
 * is dropped — a game cannot send somebody to an arbitrary URL, off-site or
 * on. And the feed is fetched WITHOUT credentials, so what goes back into the
 * frame is the public feed an anonymous visitor would see and never anything
 * belonging to the person playing. Untrusted code gets the public internet,
 * not the session.
 *
 * `source` is checked on arrival exactly as the exit bridge checks it: any
 * frame on the page can post to us, and opaque frames all post with
 * `origin: "null"`, so the name in the payload is the only discriminator
 * available.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEHUB_API_BASE } from '@/lib/api/dehub/core';

export interface GameHostMessage {
  source?: string;
  type?: string;
  to?: string;
  limit?: number;
}

/**
 * Where a game is allowed to send you. Internal paths only, each one a place
 * the desk actually draws: the feed, a single post, your profile, the
 * composer. Extend deliberately — every entry here is a route third-party
 * code can put somebody on.
 */
const NAVIGABLE: RegExp[] = [
  /^\/app$/,
  /^\/app\/post\/\d{1,12}$/,
  /^\/app\/profile$/,
  /^\/creator$/,
];

const FEED_MAX = 6;

async function relayFeed(to: MessageEventSource | null, limit: number): Promise<void> {
  if (!to) return;
  const url = new URL('/api/feed', DEHUB_API_BASE);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', String(Math.min(Math.max(limit || 2, 1), FEED_MAX)));
  try {
    const res = await fetch(url.toString(), { credentials: 'omit' });
    if (!res.ok) return;
    const json = (await res.json()) as { result?: unknown };
    const rows = Array.isArray(json?.result) ? json.result : [];
    if (!rows.length) return;
    // The frame is an opaque origin, so '*' is the only targetOrigin that can
    // reach it. Nothing sensitive is in this payload, which is why it can be.
    (to as Window).postMessage({ source: 'dehub', type: 'feed', items: rows }, '*');
  } catch {
    // A feed that will not load is not an error here: the game paints its own
    // demo posts when nothing arrives, which is what it showed before this
    // bridge existed.
  }
}

/**
 * Honour `navigate` and `feed` from the game identified by `source`.
 *
 * Pass `undefined` for `source` to listen for nothing — the caller may not
 * know which game it is hosting yet.
 */
export function useGameHostBridge(source: string | undefined): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!source) return;

    const onMessage = (event: MessageEvent<GameHostMessage | null>) => {
      const data = event.data;
      if (!data || data.source !== source) return;

      if (data.type === 'navigate') {
        const to = typeof data.to === 'string' ? data.to : '';
        if (NAVIGABLE.some((re) => re.test(to))) navigate(to);
        return;
      }

      if (data.type === 'feed') {
        void relayFeed(event.source, data.limit ?? 2);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [source, navigate]);
}
