import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';
import { EventCard } from '@/components/app/events/EventCard';
import { CreateEventDrawer } from '@/components/app/events/CreateEventDrawer';
import { EventDetailDrawer } from '@/components/app/events/EventDetailDrawer';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, KitButton, PageBody, PageEmpty, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';

type Filter = 'upcoming' | 'past' | 'my';

/**
 * The filter values are compared against, not printed — `filter === f` decides
 * which events load — so they stay English and map to keys where drawn. The
 * `capitalize` class that used to do the display casing is gone with them: a
 * CSS transform cannot translate a word.
 */
const FILTER_KEYS: Record<Filter, string> = {
  upcoming: 'events.filterUpcoming',
  past: 'events.filterPast',
  my: 'events.filterMine',
};

export default function EventsPage() {
  const { t } = useTranslation();
  const { isAuthenticated, openLoginModal } = useAuth();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);

  const { data: events = [], isLoading, isError, refetch } = useEvents(null, filter);

  const handleCreate = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    setCreateOpen(true);
  };

  return (
    <div className="min-h-screen">
      {/* noindex matches the edge: the worker classes /events as app chrome
          (noindex, follow). If events should rank later, flip BOTH here and in
          the worker (MARKETING_PAGES + sitemap) so the layers agree. */}
      <SEOHead
        title={t('events.seoTitle')}
        description={t('events.seoDescription')}
        url="https://dehub.io/events"
        image="https://dehub.io/og/events.jpg"
        noindex
      />

      <PageIsland
        className="mx-auto max-w-2xl"
        icon="events"
        title={t('events.title')}
        actions={
          <IslandAction label={t('events.createEvent')} onClick={handleCreate}>
            <Plus className="h-[18px] w-[18px]" />
          </IslandAction>
        }
        tabs={
          <PageTabs
            value={filter}
            onChange={setFilter}
            tabs={(['upcoming', 'past', 'my'] as Filter[]).map((f) => ({ id: f, label: t(FILTER_KEYS[f]) }))}
          />
        }
      />

      {/* Events grid */}
      <PageBody measure className="mx-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <PageEmpty
            title={t('events.loadFailed')}
            action={<KitButton variant="quiet" onClick={() => refetch()}>{t('events.retry')}</KitButton>}
          />
        ) : events.length === 0 ? (
          <PageEmpty
            icon="events"
            title={t(filter === 'upcoming' ? 'events.noUpcoming' : filter === 'past' ? 'events.noPast' : 'events.noneCreated')}
            action={<KitButton onClick={handleCreate}>{t('events.createEvent')}</KitButton>}
          />
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
      </PageBody>

      <CreateEventDrawer open={createOpen} onOpenChange={setCreateOpen} />
      <EventDetailDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
      />
    </div>
  );
}
