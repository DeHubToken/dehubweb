import { useEffect, useRef } from 'react';

/**
 * Auto-retries a feed refetch when data comes back empty.
 * Returns `isAutoRetrying` which should show skeleton instead of empty state.
 * 
 * @param itemCount - Number of items currently loaded
 * @param isLoading - Whether the feed is currently loading
 * @param isError - Whether the feed encountered an error
 * @param refetch - Function to refetch the feed data
 * @param maxRetries - Maximum number of auto-retry attempts (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 2000)
 */
export function useAutoRetryFeed({
  itemCount,
  isLoading,
  isError,
  refetch,
  maxRetries = 3,
  retryDelay = 2000,
}: {
  itemCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  maxRetries?: number;
  retryDelay?: number;
}) {
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoRetrying = useRef(false);

  // Reset retry count when items appear
  useEffect(() => {
    if (itemCount > 0) {
      retryCount.current = 0;
      isAutoRetrying.current = false;
    }
  }, [itemCount]);

  // Auto-retry when empty and not loading
  useEffect(() => {
    if (isLoading || isError || itemCount > 0) return;
    if (retryCount.current >= maxRetries) return;

    isAutoRetrying.current = true;
    retryTimer.current = setTimeout(() => {
      retryCount.current += 1;
      console.log(`[AutoRetry] Attempt ${retryCount.current}/${maxRetries}`);
      refetch();
    }, retryDelay);

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [itemCount, isLoading, isError, refetch, maxRetries, retryDelay]);

  return {
    isAutoRetrying: isAutoRetrying.current && itemCount === 0 && !isError,
  };
}
