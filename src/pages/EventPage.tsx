import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';
import type { CommunityEvent } from '@/hooks/use-events';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

export default function EventPage() {
  const { eventNumber } = useParams<{ eventNumber: string }>();
  const navigate = useNavigate();
  const num = eventNumber ? parseInt(eventNumber, 10) : NaN;

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['event-by-number', num],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_events')
        .select('*')
        .eq('event_number', num)
        .single();
      if (error) throw error;
      return data as CommunityEvent;
    },
    enabled: !isNaN(num),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Bad number in the URL, missing event, or a failed fetch — without this
  // the closed drawer below renders nothing and the page is a dead blank.
  if (isNaN(num) || isError || !event) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
        <p className="text-lg font-semibold text-foreground">Event not found</p>
        <p className="text-sm text-muted-foreground">This event may have been removed, or the link is invalid.</p>
        <button
          onClick={() => navigate('/app/events')}
          className="mt-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Browse events
        </button>
      </div>
    );
  }

  return (
    <>
      {event && (
        <SEOHead
          title={`${event.title} — DeHub Events`}
          description={(event.description || 'Community event on DeHub.').slice(0, 155)}
          url={`https://dehub.io/app/events/${event.event_number}`}
          type="article"
        />
      )}
      <EventDetailDrawer
        event={event ?? null}
        open={!!event}
        onOpenChange={(open) => {
          if (!open) navigate('/app/events');
        }}
      />
    </>
  );
}
