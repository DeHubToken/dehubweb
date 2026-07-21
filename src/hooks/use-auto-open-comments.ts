import { useEffect } from 'react';

/**
 * Auto-opens comments when navigating from a comment notification.
 * Checks for ?comments=1 in the URL and calls the setter once, then cleans up the param.
 *
 * Deliberately does NOT use useSearchParams: this hook runs in every feed card
 * (hundreds mounted via the persistent page cache), and useSearchParams
 * subscribes each of them to the router — every URL change re-rendered the
 * whole feed. The check only ever runs on mount, so read window.location once
 * and strip the param with history.replaceState (no navigation, no
 * subscription).
 */
export function useAutoOpenComments(setShowComments: (open: boolean) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('comments') === '1') {
      setShowComments(true);
      params.delete('comments');
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount
}
