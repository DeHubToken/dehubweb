/**
 * Fraction Portfolio
 * ==================
 * Every post you hold fractions of, with the live on-chain balance for each.
 *
 * There is no index anywhere of "which token ids does this wallet hold" — the
 * collection is ERC-1155 and nothing enumerates a holder's positions, which is
 * also why `getTokenHolders` has to sweep transfer logs to answer the reverse
 * question. So the candidate set is assembled from the two places a position
 * can come from:
 *
 *   - posts you uploaded (you were minted all 1000), and
 *   - posts you have traded, on either side.
 *
 * Then one balanceOf per candidate gives the real number, and anything that
 * comes back zero drops out. That covers every position this product can
 * create. A fraction someone sent you by hand, outside a trade, is the one case
 * it misses — the post page still shows it, and buying or selling once brings
 * it in here.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMyPosts, searchNFTs } from '@/lib/api/dehub/feed';
import { getFractionBalance, getFractionBalances } from '@/lib/api/token-holders';
import { fractionImageFor } from '@/lib/fraction-thumb';
import { getAuthToken, DEHUB_API_REQUEST_BASE } from '@/lib/api/dehub/core';
import { useAuth } from '@/contexts/AuthContext';

export interface PortfolioPosition {
  tokenId: string;
  chainId: number;
  balance: number;
  /** Share of the upload's 1000 fractions, 0–100. */
  percentage: number;
  title: string | null;
  imageUrl: string | null;
  postType: string | null;
  /** True when this is a post you uploaded, not one you bought into. */
  isCreator: boolean;
  /**
   * The post behind these fractions was deleted. The fractions still exist
   * on-chain, so the position is kept, but every surface hides it by default.
   */
  postDeleted?: boolean;
}

/** Positions whose post still exists, which is what the portfolio shows by default. */
export function livePositions(positions: PortfolioPosition[]): PortfolioPosition[] {
  return positions.filter((p) => !p.postDeleted);
}

interface Candidate {
  tokenId: string;
  chainId: number;
  title: string | null;
  imageUrl: string | null;
  postType: string | null;
  isCreator: boolean;
}

/**
 * One balanceOfBatch per chain gives every candidate's balance in a single
 * eth_call, cheap enough that the profile tab badge can show the real count.
 * A chain whose batch read fails falls back to one balanceOf per candidate.
 */
async function resolveBalances(
  candidates: Candidate[],
  address: string,
): Promise<PortfolioPosition[]> {
  const positions: PortfolioPosition[] = [];
  const balances = new Map<Candidate, number | null>();

  const byChain = new Map<number, Candidate[]>();
  for (const c of candidates) {
    const list = byChain.get(c.chainId) || [];
    list.push(c);
    byChain.set(c.chainId, list);
  }

  for (const [chainId, list] of byChain) {
    const batch = await getFractionBalances(address, list.map((c) => c.tokenId), chainId);
    if (batch) {
      for (const c of list) balances.set(c, batch.get(c.tokenId) ?? 0);
      continue;
    }
    // A few at a time, so a whale with 60 positions does not open 60 sockets.
    const STEP = 8;
    for (let i = 0; i < list.length; i += STEP) {
      const slice = list.slice(i, i + STEP);
      const results = await Promise.all(slice.map((c) => getFractionBalance(address, c.tokenId, c.chainId)));
      slice.forEach((c, k) => balances.set(c, results[k]));
    }
  }

  // A zero balance comes back as 0; null means the read itself failed.
  let answered = 0;
  for (const [candidate, balance] of balances) {
    if (balance !== null) answered++;
    if (!balance || balance <= 0) continue;
    positions.push({
      tokenId: candidate.tokenId,
      chainId: candidate.chainId,
      balance,
      percentage: (balance / 1000) * 100,
      title: candidate.title,
      imageUrl: candidate.imageUrl,
      postType: candidate.postType,
      isCreator: candidate.isCreator,
    });
  }

  // Every read failing is an outage, not an empty portfolio.
  if (candidates.length > 0 && answered === 0) {
    throw new Error('Fraction balances could not be read');
  }

  await markDeletedPosts(positions);
  return positions.sort((a, b) => b.balance - a.balance);
}

/**
 * Flag positions whose post was deleted.
 *
 * Deleting a post does not burn its fractions, so the balance read above still
 * finds them and they sat in the portfolio as cards that open nothing. The post
 * API answers 404 for a deleted post and only that counts: any other failure
 * leaves the position showing, so an outage never hides real holdings.
 */
async function markDeletedPosts(positions: PortfolioPosition[]): Promise<void> {
  const STEP = 8;
  for (let i = 0; i < positions.length; i += STEP) {
    await Promise.all(positions.slice(i, i + STEP).map(async (position) => {
      try {
        const res = await fetch(`${DEHUB_API_REQUEST_BASE}/api/nft_info/${encodeURIComponent(position.tokenId)}`);
        if (res.status === 404) position.postDeleted = true;
      } catch {
        // Unknown is not deleted.
      }
    }));
  }
}

export function useFractionPortfolio(
  address: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const key = (address || '').toLowerCase();
  const { walletAddress } = useAuth();
  // `/api/myPosts` is scoped to the signed-in token, so it may only contribute
  // to your OWN portfolio. Reading it while looking at someone else's profile
  // would file your uploads under their name.
  const isSelf = !!key && key === walletAddress?.toLowerCase();

  return useQuery({
    queryKey: ['fraction-portfolio', key, isSelf],
    queryFn: async (): Promise<PortfolioPosition[]> => {
      const candidates = new Map<string, Candidate>();

      // Posts you uploaded. Needs a Riftn token; a wallet-only session simply
      // contributes nothing here rather than failing the whole query.
      if (isSelf && getAuthToken()) {
        try {
          const mine = await getMyPosts(1, 50);
          for (const post of mine.result || []) {
            const tokenId = String(post.tokenId);
            candidates.set(tokenId, {
              tokenId,
              chainId: (post as { chainId?: number }).chainId || 8453,
              title: post.name || post.title || null,
              imageUrl: fractionImageFor(post, 400) || null,
              postType: post.postType || null,
              isCreator: true,
            });
          }
        } catch {
          // The market half of the portfolio is still worth showing.
        }
      } else if (key) {
        // Someone else's profile: their minted uploads are positions too (a
        // creator is minted all 1000). Without this a creator who never
        // traded showed "no fractions" on their own profile tab.
        try {
          const theirs = await searchNFTs({ creator_id: key, unit: 50, sortMode: 'new' });
          for (const post of theirs.data || []) {
            if (post.status && post.status !== 'minted') continue;
            const tokenId = String(post.tokenId);
            candidates.set(tokenId, {
              tokenId,
              chainId: (post as { chainId?: number }).chainId || 8453,
              title: post.name || post.title || null,
              imageUrl: fractionImageFor(post, 400) || null,
              postType: post.postType || null,
              isCreator: true,
            });
          }
        } catch {
          // The market half of the portfolio is still worth showing.
        }
      }

      // Posts traded on either side, plus anything currently listed — a seller
      // who has never traded still holds what they put on the book. Listings
      // carry the post snapshot, so a bought-into position gets a title and
      // thumbnail without an /api/feed call.
      const [trades, ownListings, listings] = await Promise.all([
        supabase
          .from('fraction_trades')
          .select('token_id, chain_id')
          .or(`seller_address.ilike.${key},buyer_address.ilike.${key}`)
          .limit(200),
        supabase
          .from('fraction_listings')
          .select('token_id, chain_id')
          .ilike('seller_address', key)
          .limit(200),
        supabase
          .from('fraction_listings')
          .select('token_id, chain_id, post_title, post_image_url, post_type')
          .limit(200),
      ]);
      // Both candidate sources failing means nothing below can be trusted;
      // surface it instead of reporting no positions.
      if (trades.error && ownListings.error) throw trades.error;

      const snapshots = new Map<string, { title: string | null; imageUrl: string | null; type: string | null }>();
      for (const l of listings.data || []) {
        if (!snapshots.has(String(l.token_id))) {
          snapshots.set(String(l.token_id), {
            title: l.post_title,
            imageUrl: l.post_image_url,
            type: l.post_type,
          });
        }
      }

      for (const row of [...(trades.data || []), ...(ownListings.data || [])]) {
        const tokenId = String(row.token_id);
        if (candidates.has(tokenId)) continue;
        const snap = snapshots.get(tokenId);
        candidates.set(tokenId, {
          tokenId,
          chainId: Number(row.chain_id) || 8453,
          title: snap?.title || null,
          imageUrl: snap?.imageUrl || null,
          postType: snap?.type || null,
          isCreator: false,
        });
      }

      return resolveBalances(Array.from(candidates.values()), key);
    },
    enabled: !!key && options.enabled !== false,
    // Each refresh reads every position's balance, so this is deliberately long.
    // Selling surfaces read the single-token balance hook instead, which is the
    // one that must be fresh.
    staleTime: 2 * 60_000,
  });
}
