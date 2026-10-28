/**
 * Stitch data for cards: what a post was stitched from, and how many stitches
 * it has.
 *
 * Read straight from the public remix_links table and remix_counts view (the
 * remix-links function is their only writer, after checking the remix is the
 * caller's own post), and batched: every card on screen asks within the same
 * tick, so a feed page costs one request for links and one for counts rather
 * than two per card. Until the tables exist everything reads as "none".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getNFTInfo } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub/types';
import { listRemixes, type RemixLink } from '@/lib/remix-links';

export interface StitchSource { sourceTokenId: number; sourceUsername: string | null; sourceAddress: string }

const BATCH_MS = 25;
const MAX_IDS = 100;

function batcher<T>(load: (ids: string[]) => Promise<Record<string, T>>) {
  let pending = new Map<string, Array<(value: T | null) => void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    const batch = pending;
    pending = new Map();
    timer = null;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += MAX_IDS) {
      const chunk = ids.slice(i, i + MAX_IDS);
      let found: Record<string, T> = {};
      try { found = await load(chunk); } catch { /* reads as none */ }
      for (const id of chunk) for (const resolve of batch.get(id) ?? []) resolve(found[id] ?? null);
    }
  };
  return (id: string) => new Promise<T | null>((resolve) => {
    pending.set(id, [...(pending.get(id) ?? []), resolve]);
    timer ??= setTimeout(flush, BATCH_MS);
  });
}

const tokenIds = (ids: string[]) => ids.filter(id => /^\d{1,15}$/.test(id)).map(Number);

const loadSource = batcher<StitchSource>(async (ids) => {
  const numeric = tokenIds(ids);
  if (!numeric.length) return {};
  const { data, error } = await supabase.from('remix_links' as never)
    .select('remix_token_id, source_token_id, source_username, source_address')
    .eq('kind', 'stitch').in('remix_token_id', numeric);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ remix_token_id: number; source_token_id: number; source_username: string | null; source_address: string }>;
  return Object.fromEntries(rows.map(r => [String(r.remix_token_id), {
    sourceTokenId: Number(r.source_token_id), sourceUsername: r.source_username, sourceAddress: r.source_address,
  }]));
});

const loadCount = batcher<number>(async (ids) => {
  const numeric = tokenIds(ids);
  if (!numeric.length) return {};
  const { data, error } = await supabase.from('remix_counts' as never)
    .select('source_token_id, stitches').in('source_token_id', numeric);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ source_token_id: number; stitches: number }>;
  return Object.fromEntries(rows.map(r => [String(r.source_token_id), Number(r.stitches) || 0]));
});

const STALE = 5 * 60_000;

/** The post this one stitched, or null. */
export function useStitchSource(tokenId: string | number | null | undefined, enabled = true) {
  const id = tokenId == null ? '' : String(tokenId);
  return useQuery({
    queryKey: ['stitch-source', id],
    queryFn: () => loadSource(id),
    enabled: enabled && !!id,
    staleTime: STALE,
    retry: false,
  }).data ?? null;
}

/** How many stitches this post has. */
export function useStitchCount(tokenId: string | number | null | undefined, enabled = true) {
  const id = tokenId == null ? '' : String(tokenId);
  return useQuery({
    queryKey: ['stitch-count', id],
    queryFn: () => loadCount(id),
    enabled: enabled && !!id,
    staleTime: STALE,
    retry: false,
  }).data ?? 0;
}

export interface StitchItem { link: RemixLink; post: DeHubNFT }

/**
 * The stitches of a post, newest first, with each stitch's post for its
 * thumbnail and title. Deleted or hidden stitches are left out.
 */
export function useStitchList(tokenId: string | number | null | undefined, enabled: boolean) {
  const id = tokenId == null ? '' : String(tokenId);
  return useQuery({
    queryKey: ['stitch-list', id],
    queryFn: async () => {
      const { links } = await listRemixes(id, 'stitch');
      const posts = await Promise.allSettled(links.map(link => getNFTInfo(String(link.remixTokenId))));
      return links.flatMap((link, i) => {
        const result = posts[i];
        if (result.status !== 'fulfilled' || !result.value) return [];
        const post = result.value as DeHubNFT & { deleted?: boolean };
        if (post.isHidden || post.deleted) return [];
        return [{ link, post }];
      });
    },
    enabled: enabled && !!id,
    staleTime: 60_000,
    retry: 1,
  });
}
