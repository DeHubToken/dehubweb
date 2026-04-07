import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';
import { EventCard } from '@/components/app/events/EventCard';
import { CreateEventDrawer } from '@/components/app/events/CreateEventDrawer';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';
import { SEOHead } from '@/components/SEOHead';
import { cn } from '@/lib/utils';

type Filter = 'upcoming' | 'past' | 'my';

export default function EventsPage() {
  const { isAuthenticated, openLoginModal } = useAuth();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);

  const { data: events = [], isLoading } = useEvents(null, filter);

  const handleCreate = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setCreateOpen(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-3 py-4">
      <SEOHead title="Events - DeHub" description="Discover and create events on DeHub" />

      <h1 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
        <CalendarDays className="w-5 h-5" />
        Events
      </h1>

      {/* Filter tabs + create */}
      <div className="flex items-center border-b border-white/[0.08] mb-4">
        {(['upcoming', 'past', 'my'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize',
              filter === f
                ? 'text-white border-white'
                : 'text-zinc-500 border-transparent hover:text-white'
            )}
          >
            {f === 'my' ? 'My Events' : f}
          </button>
        ))}
        <button
          onClick={handleCreate}
          className="ml-auto px-4 py-2.5 text-2xl font-medium text-zinc-500 hover:text-white transition-colors border-b-2 border-transparent -mb-[1px] leading-none"
        >
          +
        </button>
      </div>

      {/* Events grid */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">
            {filter === 'upcoming' ? 'No upcoming events yet' : filter === 'past' ? 'No past events' : 'You haven\'t created any events'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => setSelectedEvent(event)}
            />
          ))}
        </div>
      )}

      <CreateEventDrawer open={createOpen} onOpenChange={setCreateOpen} />
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
      />
    </div>
  );
}
