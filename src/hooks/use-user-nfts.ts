import { useState, useEffect, useCallback } from 'react';
import { getUserNFTs, type DeHubNFT, type PaginatedResponse } from '@/lib/api/dehub';

interface UseUserNFTsOptions {
  userId?: string;
  enabled?: boolean;
}

export function useUserNFTs({ userId, enabled = true }: UseUserNFTsOptions) {
  const [nfts, setNfts] = useState<DeHubNFT[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageNum: number, append = false) => {
    if (!userId || !enabled) return;
    setIsLoading(true);
    try {
      const result: PaginatedResponse<DeHubNFT> = await getUserNFTs(userId, pageNum, 20);
      const items = result.data || [];
      setNfts((prev) => (append ? [...prev, ...items] : items));
      setTotal(result.total || 0);
      setHasMore(items.length >= 20);
    } catch (err) {
      console.error('[UserNFTs] Failed to fetch NFTs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, enabled]);

  useEffect(() => {
    if (userId && enabled) {
      setPage(1);
      fetchPage(1, false);
    } else {
      setNfts([]);
      setTotal(0);
    }
  }, [userId, enabled, fetchPage]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPage(nextPage, true);
    }
  }, [isLoading, hasMore, page, fetchPage]);

  return { nfts, total, isLoading, hasMore, loadMore };
}
