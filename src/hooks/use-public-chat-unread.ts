import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createPublicChatUnreadStore, type PublicChatUnreadMessage } from '@/lib/public-chat-unread-store';

export const publicChatUnread = createPublicChatUnreadStore({
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith('dehub_public_chat_unread:')) publicChatUnread.refresh();
  });
}

const readers = new Map<string, number>();

export function recordPublicChatUnread(account: string, message: PublicChatUnreadMessage) {
  const added = publicChatUnread.record(account, message);
  if (!document.hidden && (readers.get(account.toLowerCase()) || 0) > 0) {
    publicChatUnread.markRead(account);
  }
  return added;
}

export function usePublicChatUnreadCount() {
  const { isAuthenticated, walletAddress } = useAuth();
  const account = isAuthenticated ? walletAddress || '' : '';
  return useSyncExternalStore(publicChatUnread.subscribe, () => publicChatUnread.count(account), () => 0);
}

/** Hidden cached pages and responsive sidebars must never acknowledge a room. */
export function usePublicChatReading(active: boolean, surface?: RefObject<HTMLElement>) {
  const { isAuthenticated, walletAddress } = useAuth();
  useEffect(() => {
    if (!active || !isAuthenticated || !walletAddress) return;
    const account = walletAddress.toLowerCase();
    let inView = !surface;
    let registered = false;
    const sync = () => {
      const reading = inView && !document.hidden;
      if (reading === registered) return;
      registered = reading;
      readers.set(account, Math.max(0, (readers.get(account) || 0) + (reading ? 1 : -1)));
      if (reading) publicChatUnread.markRead(account);
    };
    const observer = surface?.current ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }) : null;
    if (surface?.current) observer?.observe(surface.current);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      if (registered) readers.set(account, Math.max(0, (readers.get(account) || 0) - 1));
    };
  }, [active, isAuthenticated, walletAddress, surface]);
}
