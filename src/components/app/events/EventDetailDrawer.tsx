import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { MapPin, Calendar, Users, Star, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { useAuth } from '@/contexts/AuthContext';
import { useEventRsvp, useToggleRsvp, useDeleteEvent, useEventRsvps } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';
import { toast } from 'sonner';

interface EventDetailDrawerProps {
  event: CommunityEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailDrawer({ event, open, onOpenChange }: EventDetailDrawerProps) {
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const { data: myRsvp } = useEventRsvp(event?.id);
  const { data: allRsvps = [] } = useEventRsvps(event?.id);
  const toggleRsvp = useToggleRsvp();
  const deleteEvent = useDeleteEvent();

  if (!event) return null;

  const startDate = new Date(event.starts_at);
  const isCreator = walletAddress && event.creator_wallet_address === walletAddress.toLowerCase();
  const goingList = allRsvps.filter(r => r.status === 'going');
  const interestedList = allRsvps.filter(r => r.status === 'interested');

  const handleRsvp = (status: 'going' | 'interested') => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (myRsvp?.status === status) {
      toggleRsvp.mutate({ eventId: event.id, status: 'remove' });
    } else {
      toggleRsvp.mutate({ eventId: event.id, status });
    }
  };

  const handleDelete = () => {
    deleteEvent.mutate(event.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[90vh]')}>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{event.title}</DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto">
          {/* Cover */}
          <div className="h-48 bg-gradient-to-br from-purple-500/20 to-blue-500/20 relative">
            {event.cover_image_url && (
              <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
            )}
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Date/time */}
            <div className="flex items-start gap-3">
              <div className="bg-white/10 rounded-lg px-3 py-2 text-center shrink-0">
                <div className="text-xs font-bold text-primary uppercase">{format(startDate, 'MMM')}</div>
                <div className="text-xl font-bold text-white">{format(startDate, 'd')}</div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{event.title}</h2>
                <p className="text-sm text-zinc-400 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(startDate, 'EEEE, MMMM d · h:mm a')}
                  {event.ends_at && ` – ${format(new Date(event.ends_at), 'h:mm a')}`}
                </p>
                {event.location && (
                  <p className="text-sm text-zinc-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {event.location}
                  </p>
                )}
              </div>
            </div>

            {/* RSVP Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleRsvp('going')}
                variant={myRsvp?.status === 'going' ? 'default' : 'outline'}
                className={cn(
                  'flex-1 rounded-xl',
                  myRsvp?.status === 'going'
                    ? 'bg-primary text-primary-foreground'
                    : 'border-white/10 text-white hover:bg-white/10'
                )}
                disabled={toggleRsvp.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Going ({event.going_count})
              </Button>
              <Button
                onClick={() => handleRsvp('interested')}
                variant={myRsvp?.status === 'interested' ? 'default' : 'outline'}
                className={cn(
                  'flex-1 rounded-xl',
                  myRsvp?.status === 'interested'
                    ? 'bg-amber-500/80 text-white'
                    : 'border-white/10 text-white hover:bg-white/10'
                )}
                disabled={toggleRsvp.isPending}
              >
                <Star className="w-4 h-4 mr-1.5" />
                Interested ({event.interested_count})
              </Button>
            </div>

            {/* Description */}
            {event.description && (
              <div>
                <h3 className="text-sm font-medium text-white mb-1">Details</h3>
                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

            {/* Attendees summary */}
            {(goingList.length > 0 || interestedList.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-white mb-2">Guests</h3>
                <div className="flex gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {goingList.length} going
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    {interestedList.length} interested
                  </span>
                </div>
              </div>
            )}

            {/* Creator info + delete */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <p className="text-xs text-zinc-500">
                Created by {event.creator_username || `${event.creator_wallet_address.slice(0, 6)}...`}
              </p>
              {isCreator && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteEvent.isPending}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
