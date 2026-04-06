/**
 * Event Attendees Drawer
 * =======================
 * Shows paginated list of going / interested users with infinite scroll.
 * Resolves profile info (avatar, username, display name) from the DeHub API.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl } from '@/lib/media-url';
import { useNavigate } from 'react-router-dom';
import { formatTimeAgo } from '@/lib/feed-utils';
import { getAccountInfo } from '@/lib/api/dehub/users';
import { BadgeIcon } from '@/components/app/BadgeIcon';

interface Attendee {
  id: string;
  wallet_address: string;
  status: string;
  created_at: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

interface EventAttendeesDrawerProps {
  eventId: string;
  type: 'going' | 'interested';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 20;

export function EventAttendeesDrawer({ eventId, type, open, onOpenChange }: EventAttendeesDrawerProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const navigate = useNavigate();

  const resolveProfiles = useCallback(async (items: Attendee[]): Promise<Attendee[]> => {
    const resolved = await Promise.allSettled(
      items.map(async (a) => {
        try {
          const profile = await getAccountInfo(a.wallet_address);
          return {
            ...a,
            username: profile?.username || undefined,
            display_name: (profile as any)?.display_name || (profile as any)?.displayName || undefined,
            avatar_url: (profile as any)?.avatar || (profile as any)?.avatar_url || undefined,
          };
        } catch {
          return a;
        }
      })
    );
    return resolved.map((r) => r.status === 'fulfilled' ? r.value : items[0]);
  }, []);

  const loadPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_event_rsvps')
        .select('*')
        .eq('event_id', eventId)
        .eq('status', type)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      const newData = (data ?? []) as Attendee[];
      if (newData.length < PAGE_SIZE) setHasMore(false);

      // Resolve profiles from API
      const withProfiles = await resolveProfiles(newData);
      setAttendees(prev => pageNum === 0 ? withProfiles : [...prev, ...withProfiles]);
    } catch (err) {
      console.error('[EventAttendees] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, type, resolveProfiles]);

  // Reset and load when opened
  useEffect(() => {
    if (open) {
      setAttendees([]);
      setPage(0);
      setHasMore(true);
      loadPage(0);
    }
  }, [open, loadPage]);

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loaderCallback = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node || !hasMore || loading) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPage(nextPage);
        }
      },
      { rootMargin: '400px' }
    );
    observerRef.current.observe(node);
  }, [hasMore, loading, page, loadPage]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[80vh]')}>
        <DrawerHeader>
          <DrawerTitle className="text-white capitalize">{type} ({attendees.length}{hasMore ? '+' : ''})</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto max-h-[60vh] space-y-1">
          {attendees.length === 0 && !loading && (
            <p className="text-center text-zinc-500 text-sm py-8">No one yet</p>
          )}

          {attendees.map((a) => {
            const avatarUrl = buildAvatarUrl(a.wallet_address, a.avatar_url);
            const displayName = a.display_name || a.username || `${a.wallet_address.slice(0, 6)}...${a.wallet_address.slice(-4)}`;
            const handle = a.username;
            return (
              <button
                key={a.id}
                onClick={() => { onOpenChange(false); navigate(`/${handle || a.wallet_address}`); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors"
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={avatarUrl} />
                  <AvatarFallback className="bg-zinc-700 text-white text-xs">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-white truncate">{displayName}</p>
                    <BadgeIcon username={handle || undefined} className="w-3 h-3 shrink-0" />
                  </div>
                  {handle && (
                    <p className="text-xs text-zinc-500">@{handle}</p>
                  )}
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{formatTimeAgo(a.created_at)}</span>
              </button>
            );
          })}

          {loading && (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 px-3">
                  <Skeleton className="w-9 h-9 rounded-full bg-white/[0.06]" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3.5 w-24 bg-white/[0.06]" />
                    <Skeleton className="h-3 w-16 bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && !loading && <div ref={loaderCallback} className="h-4" />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
