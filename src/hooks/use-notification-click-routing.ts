/**
 * Where a pushed notification takes you.
 *
 * The service worker cannot navigate an existing tab — `WindowClient.navigate`
 * is not on every browser, and the tab it focuses may be showing anything. So
 * it focuses the tab and posts the destination; this listens and routes.
 *
 * A tab that is closed takes the other branch: the worker opens the URL
 * directly and this never runs.
 *
 * @module hooks/use-notification-click-routing
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface NotificationClickMessage {
  type?: string;
  url?: string;
}

export function useNotificationClickRouting() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent<NotificationClickMessage>) => {
      const data = event.data;
      if (!data || data.type !== 'dehub:notification-click') return;
      // Same-origin paths only. The worker builds these from our own payload,
      // but routing on a string that arrived through postMessage without
      // checking is how an open redirect gets written by accident.
      const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/app/notifications';
      navigate(url);
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);
}
