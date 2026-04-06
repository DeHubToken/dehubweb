/**
 * Event Link Embed
 * ================
 * Detects event URLs in post content and renders them as rich event preview cards.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Calendar, MapPin, Users, Flame, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEventRsvps, type CommunityEvent } from '@/hooks/use-events';
import { FriendsAtEvent } from './FriendsAtEvent';

/** Extract event number from a URL like /app/events/1 */
export function extractEventNumber(text: string): string | null {
  const match = text.match(/\/app\/events\/(\d+)/);
  return match ? match[1] : null;
}

/** Check if text contains an event link */
export function hasEventLink(text: string): boolean {
  return /\/app\/events\/\d+/.test(text);
}

interface EventLinkEmbedProps {
  eventNumber: string;
}

export function EventLinkEmbed({ eventNumber }: EventLinkEmbedProps) {
  const navigate = useNavigate();
  const num = parseInt(eventNumber, 10);
  const { data: event, isLoading } = useQuery({
    queryKey: ['event-by-number', num],
    enabled: !isNaN(num),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_events')
        .select('*')
        .eq('event_number', num)
        .single();
      if (error) throw error;
      return data as CommunityEvent;
    },
  });
  const { data: rsvps = [] } = useEventRsvps(event?.id);

  if (isLoading) {
    return (
      <div className="mt-2 h-40 rounded-xl bg-white/[0.04] animate-pulse" />
    );
  }

  if (!event) return null;

  const startDate = new Date(event.starts_at);
  const goingCount = rsvps.filter(r => r.status === 'going' || r.status === 'approved').length || event.going_count;
  const interestedCount = rsvps.filter(r => r.status === 'interested').length || event.interested_count;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/app/events/${event.event_number}`);
      }}
      data-no-navigate
      className="w-full rounded-xl border border-white/[0.08] overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
    >
      {/* Banner */}
      <div className="relative h-28 bg-gradient-to-br from-white/5 to-white/10">
        {event.cover_image_url && (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {event.is_private && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
            <Lock className="w-2.5 h-2.5 text-zinc-300" />
            <span className="text-[9px] font-medium text-zinc-300">Private</span>
          </div>
        )}
        <FriendsAtEvent eventId={event.id} mode="overlay" />
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <h3 className="font-semibold text-white text-sm line-clamp-1">{event.title}</h3>
        <p className="text-xs text-zinc-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {format(startDate, 'EEE, MMM d · h:mm a')}
          {event.ends_at && ` – ${format(new Date(event.ends_at), 'h:mm a')}`}
        </p>
        {event.location && (
          <p className="text-xs text-zinc-400 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {event.location}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-zinc-500 pt-1">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {goingCount} going
          </span>
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3" />
            {interestedCount} interested
          </span>
        </div>
      </div>
    </button>
  );
}
