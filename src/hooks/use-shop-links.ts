/**
 * Shop link allowance
 * ===================
 * How many affiliate/shop links the signed-in creator may hang off one post.
 * Three for everybody, one more for every rung of the badge ladder.
 *
 * **Asked, not derived.** `useSelfBadge` deliberately over-reports a tier so a
 * badge does not vanish mid-stake, and the ladder scales with the DHB price —
 * so a count worked out here would offer a creator a link slot the mint is
 * about to refuse. `getShopLinkAllowance` degrades to the base three on any
 * failure, so this never blocks the composer.
 *
 * Cached for the session: a tier does not move between opening the composer
 * and pressing Post, and every composer surface (upload, Go Live, the edit
 * sheet) shares the one entry.
 */

import { useQuery } from '@tanstack/react-query';
import { getShopLinkAllowance, SHOP_LINK_BASE_ALLOWANCE, type ShopLinkAllowance } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

const BASE: ShopLinkAllowance = {
  allowance: SHOP_LINK_BASE_ALLOWANCE,
  base: SHOP_LINK_BASE_ALLOWANCE,
  max: SHOP_LINK_BASE_ALLOWANCE,
  tier: null,
};

export function useShopLinkAllowance(): ShopLinkAllowance {
  const { walletAddress } = useAuth();
  const { data } = useQuery({
    queryKey: ['shop-link-allowance', walletAddress?.toLowerCase() ?? null],
    queryFn: getShopLinkAllowance,
    enabled: !!walletAddress,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  return data ?? BASE;
}
