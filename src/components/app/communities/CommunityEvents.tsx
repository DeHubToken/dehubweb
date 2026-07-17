import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';
import { EventCard } from '@/components/app/events/EventCard';
import { CreateEventDrawer } from '@/components/app/events/CreateEventDrawer';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';

interface CommunityEventsProps {
  communityId: string;
  isMember: boolean;
}

export function CommunityEvents({ communityId, isMember }: CommunityEventsProps) {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const { data: events = [], isLoading } = useEvents(communityId);

  const upcoming = events.filter(e => new Date(e.starts_at) >= new Date());
  const past = events.filter(e => new Date(e.starts_at) < new Date());

  const handleCreate = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setCreateOpen(true);
  };

  return (
    <div className="space-y-4">
      {isMember && (
        <Button onClick={handleCreate} variant="outline" size="sm" className="rounded-xl border-white/10 text-white gap-1.5">
          <Plus className="w-4 h-4" />
          Create Event
        </Button>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">No events yet</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">Upcoming</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {upcoming.map(e => <EventCard key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2 mt-4">Past</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {past.map(e => <EventCard key={e.id} event={e} onClick={() => setSelectedEvent(e)} />)}
              </div>
            </div>
          )}
        </>
      )}

      <CreateEventDrawer open={createOpen} onOpenChange={setCreateOpen} communityId={communityId} />
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
      />
    </div>
  );
}
