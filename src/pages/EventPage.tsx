import { useTranslation as _useCopy } from 'react-i18next';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';
import type { CommunityEvent } from '@/hooks/use-events';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

export default function EventPage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { eventNumber } = useParams<{ eventNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    // Instant open from the events list: the ['events', …] caches already hold
    // the full row, so paint it immediately while the fetch runs behind it.
    placeholderData: () => {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ['events'] })) {
        const rows = query.state.data as CommunityEvent[] | undefined;
        const hit = rows?.find?.(e => e.event_number === num);
        if (hit) return hit;
      }
      return undefined;
    },
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
        <ThemedIcon icon="events" alt="" className="w-16 h-16 object-contain opacity-75" />
        <p className="text-lg font-semibold text-foreground">{_copy("copy.6bee3b1fbad1", { defaultValue: "Event not found" })}</p>
        <p className="text-sm text-muted-foreground">{_copy("copy.c739354bc06d", { defaultValue: "This event may have been removed, or the link is invalid." })}</p>
        <button
          onClick={() => navigate('/app/events')}
          className="mt-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >{_copy("copy.8d71009f1092", { defaultValue: "Browse events" })}</button>
      </div>
    );
  }

  return (
    <>
      {event && (
        <SEOHead
          title={_copy("copy.e8474fe0fb3e", { defaultValue: "{{value1}} — DeHub Events", value1: event.title })}
          description={(event.description || t('events.defaultSeoDescription')).slice(0, 155)}
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
