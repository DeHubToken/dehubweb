import { format } from 'date-fns';
import { MapPin, Users, Star, Calendar } from 'lucide-react';
import type { CommunityEvent } from '@/hooks/use-events';
import { cn } from '@/lib/utils';

interface EventCardProps {
  event: CommunityEvent;
  onClick: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
  const startDate = new Date(event.starts_at);
  const isPast = startDate < new Date();

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border border-white/[0.08] overflow-hidden',
        'bg-white/[0.03] hover:bg-white/[0.06] transition-colors',
        isPast && 'opacity-60'
      )}
    >
      {/* Cover image or gradient */}
      <div className="relative h-32 bg-gradient-to-br from-purple-500/20 to-blue-500/20">
        {event.cover_image_url && (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {/* Date badge */}
        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-center">
          <div className="text-xs font-bold text-primary uppercase">
            {format(startDate, 'MMM')}
          </div>
          <div className="text-lg font-bold text-white leading-tight">
            {format(startDate, 'd')}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-xs text-zinc-400 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {format(startDate, 'EEE, MMM d · h:mm a')}
          {event.ends_at && ` – ${format(new Date(event.ends_at), 'h:mm a')}`}
        </p>
        <h3 className="font-semibold text-white text-sm line-clamp-2">{event.title}</h3>
        {event.location && (
          <p className="text-xs text-zinc-400 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            {event.location}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-zinc-500 pt-1">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {event.going_count} going
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            {event.interested_count} interested
          </span>
        </div>
      </div>
    </button>
  );
}
