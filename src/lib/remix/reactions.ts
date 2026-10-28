/**
 * Reaction helpers on top of the shared remix links (lib/remix-links): what
 * feed cards read for a whole page of posts in one go, and what a live stream
 * is reacting to right now.
 */
import { supabase } from '@/integrations/supabase/client';
import { getRemixCounts, getRemixLinks } from '@/lib/remix-links';

/** The post id at the end of a DeHub post URL, or null. */
export function tokenIdFromPostUrl(url: string): number | null {
  const match = url.match(/^https:\/\/(?:www\.|staging\.)?dehub\.io\/(?:app\/)?(?:post|video)\/(\d+)(?:[/?#]|$)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export interface ReactionSummary {
  /** The post this one is a reaction to. */
  reactionOf: { tokenId: number; username: string | null } | null;
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
    let ok = true;
    const [links, counts] = await Promise.all([
      getRemixLinks(chunk).catch(() => { ok = false; return {}; }),
      getRemixCounts(chunk).catch(() => { ok = false; return {}; }),
    ]);
    for (const id of chunk) {
      const link = links[String(id)];
      const summary: ReactionSummary = {
        reactionOf: link && (link.kind === 'react' || link.kind === 'react_live')
          ? { tokenId: link.sourceTokenId, username: link.sourceUsername }
          : null,
        reactions: counts[String(id)]?.reactions ?? 0,
      };
      // A failed lookup only hides a chip; it is asked again next time.
      if (!ok) cache.delete(id);
      batch.get(id)?.(summary);
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

/** The DeHub video a live stream has on screen now, if any. Rows are public. */
export async function currentLiveReaction(streamTokenId: number | string) {
  const { data } = await supabase
    .from('remix_links' as never)
    .select('source_token_id, source_username')
    .eq('stream_token_id', Number(streamTokenId))
    .eq('kind', 'react_live')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { source_token_id: number; source_username: string | null } | null;
  return row ? { sourceTokenId: Number(row.source_token_id), sourceUsername: row.source_username } : null;
}
