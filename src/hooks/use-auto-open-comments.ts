import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Auto-opens comments when navigating from a comment notification.
 * Checks for ?comments=1 in the URL and calls the setter once, then cleans up the param.
 */
export function useAutoOpenComments(setShowComments: (open: boolean) => void) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('comments') === '1') {
      setShowComments(true);
      // Clean up the query param without triggering a navigation
      searchParams.delete('comments');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // Only on mount
}
