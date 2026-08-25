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
import { getMyPosts } from '@/lib/api/dehub/feed';
import { getFractionBalance } from '@/lib/api/token-holders';
import { buildImageUrl } from '@/lib/media-url';
import { getAuthToken } from '@/lib/api/dehub/core';
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
}

interface Candidate {
  tokenId: string;
  chainId: number;
  title: string | null;
  imageUrl: string | null;
  postType: string | null;
  isCreator: boolean;
}

/** Read balances a few at a time — a whale with 60 positions should not open 60 sockets. */
async function resolveBalances(
  candidates: Candidate[],
  address: string,
): Promise<PortfolioPosition[]> {
  const positions: PortfolioPosition[] = [];
  const BATCH = 8;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (c) => ({
        candidate: c,
        balance: await getFractionBalance(address, c.tokenId, c.chainId),
      })),
    );
    for (const { candidate, balance } of results) {
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
  }

  return positions.sort((a, b) => b.balance - a.balance);
}

export function useFractionPortfolio(address: string | null | undefined) {
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

      // Posts you uploaded. Needs a DeHub token; a wallet-only session simply
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
              imageUrl: buildImageUrl(post.tokenId, post.imageUrl, 400) || null,
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
    enabled: !!key,
    // Each refresh is one eth_call per position, so this is deliberately long.
    // Selling surfaces read the single-token balance hook instead, which is the
    // one that must be fresh.
    staleTime: 2 * 60_000,
  });
}
