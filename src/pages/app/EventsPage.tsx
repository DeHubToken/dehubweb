import { useState, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
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

  const { data: events = [], isLoading, isError, refetch } = useEvents(null, filter);

  const handleCreate = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setCreateOpen(true);
  };

  // Swallow the events grid at the sticky header bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  return (
    <div className="min-h-screen">
      <SEOHead title="Events - DeHub" description="Discover and create events on DeHub" />

      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-2xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3">
          <h1 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Events
          </h1>

          {/* Filter tabs + create */}
          <div className="flex items-center border-b border-white/[0.08]">
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
        </div>
      </div>

      {/* Events grid */}
      <div ref={contentRef} className="max-w-2xl mx-auto px-2 sm:px-3 pt-3 pb-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm mb-3">Couldn't load events</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-white/[0.06] hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
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
      </div>

      <CreateEventDrawer open={createOpen} onOpenChange={setCreateOpen} />
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
      />
    </div>
  );
}
