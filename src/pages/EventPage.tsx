import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';
import type { CommunityEvent } from '@/hooks/use-events';
import { Loader2 } from 'lucide-react';

export default function EventPage() {
  const { eventNumber } = useParams<{ eventNumber: string }>();
  const navigate = useNavigate();
  const num = eventNumber ? parseInt(eventNumber, 10) : NaN;

  const { data: event, isLoading } = useQuery({
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

  return (
    <EventDetailDrawer
      event={event ?? null}
      open={!!event}
      onOpenChange={(open) => {
        if (!open) navigate('/app/events');
      }}
    />
  );
}
