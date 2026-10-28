/**
 * Reactions to DeHub videos: recorded reaction posts and live streams that
 * put a DeHub video on screen.
 *
 * Writes go through the remix-links edge function, which checks the source
 * every time (public, ungated, reactions allowed) and tells its creator. Feed
 * cards read what they need for a whole page of posts in one RPC, batched.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export interface RemixLink {
  kind: 'react' | 'react_live' | 'duet' | 'stitch';
  sourceTokenId: number;
  sourceUsername: string | null;
  sourceTitle: string;
  remixTokenId: number | null;
  streamTokenId: number | null;
  remixerAddress: string;
  remixerUsername: string | null;
  active: boolean;
  createdAt: string;
}

/** `status` is the function's HTTP answer; none means it could not be reached at all. */
export class RemixLinksError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * The service itself is missing or down (not deployed yet, a 5xx, offline),
 * as opposed to it answering no. Callers that already ran the same checks in
 * the browser may carry on; a real refusal is a 4xx and still stops them.
 */
export function remixLinksUnavailable(error: unknown): boolean {
  if (!(error instanceof RemixLinksError)) return false;
  return error.status === undefined || error.status === 404 || error.status >= 500;
}

async function call<T>(body: Record<string, unknown>, signedIn: boolean): Promise<T> {
  const headers: Record<string, string> = {};
  if (signedIn) headers['x-dehub-token'] = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('remix-links', { body, headers });
  if (data?.error) throw new RemixLinksError(data.error, 400);
  if (error) {
    const context = (error as { context?: Response }).context;
    const status = context && typeof context.status === 'number' ? context.status : undefined;
    const reason = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new RemixLinksError(reason?.error || error.message || 'Reaction request failed', status);
  }
  return data as T;
}

/** Whether a video may be reacted to; `reason` says why not. */
export function checkReactionSource(sourceTokenId: number | string) {
  return call<{ allowed: boolean; reason: string | null }>({ action: 'check', sourceTokenId: String(sourceTokenId) }, false);
}

/** Ties a minted reaction post to its source and notifies the source's creator. */
export function linkReactionPost(sourceTokenId: number | string, remixTokenId: number | string) {
  return call<{ link: RemixLink | null }>({ action: 'posted', sourceTokenId: String(sourceTokenId), remixTokenId: String(remixTokenId) }, true);
}

/** Puts a DeHub video on a live stream as what it is reacting to. */
export async function startLiveReaction(streamTokenId: number | string, sourceTokenId: number | string) {
  return (await call<{ link: RemixLink }>({ action: 'live', streamTokenId: String(streamTokenId), sourceTokenId: String(sourceTokenId) }, true)).link;
}

export async function stopLiveReaction(streamTokenId: number | string) {
  await call({ action: 'live-stop', streamTokenId: String(streamTokenId) }, true);
}

export async function currentLiveReaction(streamTokenId: number | string) {
  return (await call<{ link: RemixLink | null }>({ action: 'current', streamTokenId: String(streamTokenId) }, false)).link;
}

export function listReactions(sourceTokenId: number | string, before?: string) {
  return call<{ reactions: RemixLink[]; total: number; hasMore: boolean }>(
    { action: 'list', sourceTokenId: String(sourceTokenId), before },
    false,
  );
}

export function getReactionSetting(tokenId: number | string) {
  return call<{ allowReact: boolean; blocked: string | null }>({ action: 'settings', tokenId: String(tokenId) }, false);
}

/** `tokenId` omitted sets the account default. */
export function setReactionSetting(allowReact: boolean, tokenId?: number | string) {
  return call<{ allowReact: boolean }>({ action: 'set', allowReact, tokenId: tokenId == null ? undefined : String(tokenId) }, true);
}

/* ───────────────────────── feed summary, batched ───────────────────────── */

export interface ReactionSummary {
  /** The post this one is a reaction to. */
  reactionOf: { tokenId: number; username: string | null; title: string } | null;
  reactions: number;
}

const EMPTY: ReactionSummary = { reactionOf: null, reactions: 0 };
const cache = new Map<number, Promise<ReactionSummary>>();
let queue = new Map<number, (s: ReactionSummary) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const found = new Map<number, ReactionSummary>();
    try {
      const { data } = await supabase.rpc('remix_link_summary' as never, { token_ids: chunk } as never);
      for (const row of (data ?? []) as { token_id: number; reaction_of: number | null; reaction_of_username: string | null; reaction_of_title: string | null; reactions: number }[]) {
        found.set(Number(row.token_id), {
          reactionOf: row.reaction_of ? { tokenId: Number(row.reaction_of), username: row.reaction_of_username, title: row.reaction_of_title ?? '' } : null,
          reactions: Number(row.reactions) || 0,
        });
      }
    } catch {
      // A missing summary only hides a chip; the post itself is unaffected.
    }
    for (const id of chunk) {
      const summary = found.get(id);
      if (!summary) cache.delete(id);
      batch.get(id)?.(summary ?? EMPTY);
    }
  }
}

/** What a post is a reaction to and how many reactions it has. Posts asked for in the same tick share one call. */
export function reactionSummary(tokenId: number | string): Promise<ReactionSummary> {
  const id = Number(tokenId);
  if (!Number.isSafeInteger(id) || id <= 0) return Promise.resolve(EMPTY);
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = new Promise<ReactionSummary>((resolve) => {
    queue.set(id, resolve);
    if (!timer) timer = setTimeout(() => void flush(), 30);
  });
  cache.set(id, pending);
  return pending;
}

export function forgetReactionSummary(tokenId: number | string) {
  cache.delete(Number(tokenId));
}

/** The post id at the end of a DeHub post URL, or null. */
export function tokenIdFromPostUrl(url: string): number | null {
  const match = url.match(/^https:\/\/(?:www\.|staging\.)?dehub\.io\/(?:app\/)?(?:post|video)\/(\d+)(?:[/?#]|$)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
