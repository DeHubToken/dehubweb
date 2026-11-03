import { useEffect } from 'react';
import { useTotalUnreadCount } from '@/hooks/use-messages';
import { setDmUnreadCount } from '@/lib/dm-unread-store';

/** Publishes the DM unread total for the nav badges. Lazy-loaded; renders nothing. */
export default function DmUnreadBridge(): null {
  const total = useTotalUnreadCount();
  useEffect(() => { setDmUnreadCount(total); }, [total]);
  useEffect(() => () => setDmUnreadCount(0), []);
  return null;
}
