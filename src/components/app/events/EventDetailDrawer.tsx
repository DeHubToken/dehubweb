import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { MapPin, Calendar, Users, Star, Trash2, CheckCircle2, Sparkles, MessageSquare } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { useAuth } from '@/contexts/AuthContext';
import { useEventRsvp, useToggleRsvp, useDeleteEvent, useEventRsvps } from '@/hooks/use-events';
import type { CommunityEvent } from '@/hooks/use-events';
import { toast } from 'sonner';
import { EventChat } from './EventChat';
import { EventAttendeesDrawer } from './EventAttendeesDrawer';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { buildAvatarUrl } from '@/lib/media-url';
import { useNavigate } from 'react-router-dom';

function CreatorInfo({ event }: { event: CommunityEvent }) {
  const navigate = useNavigate();
  const avatarUrl = buildAvatarUrl(event.creator_wallet_address, event.creator_avatar);
  const displayName = event.creator_username || `${event.creator_wallet_address.slice(0, 6)}...`;
  const handle = event.creator_username;

  return (
    <button
      onClick={() => navigate(`/${handle || event.creator_wallet_address}`)}
      className="flex items-center gap-2 group"
    >
      <Avatar className="w-6 h-6">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback className="bg-zinc-700 text-white text-[9px]">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
        <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">
          Created by <span className="font-medium text-zinc-300 group-hover:text-white">{displayName}</span>
        </span>
        <BadgeIcon username={handle || undefined} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />
      </span>
    </button>
  );
}

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
  const [showChat, setShowChat] = useState(false);
  const [attendeesType, setAttendeesType] = useState<'going' | 'interested' | null>(null);

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
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[92vh]')}>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{event.title}</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto">
            {/* Cover */}
            <div className="h-32 bg-gradient-to-br from-white/5 to-white/10 relative">
              {event.cover_image_url && (
                <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
              )}
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Date/time */}
              <div className="flex items-start gap-3">
                <div className="bg-white/10 rounded-lg px-3 py-2 text-center shrink-0">
                  <div className="text-xs font-bold text-white/70 uppercase">{format(startDate, 'MMM')}</div>
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
                <LiquidGlassBubble2
                  label={`Going (${goingList.length})`}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => handleRsvp('going')}
                  disabled={toggleRsvp.isPending}
                  width="100%"
                  height="42px"
                  className={cn(
                    'flex-1',
                    myRsvp?.status === 'going' && 'opacity-100 [&>div]:!border [&>div]:!border-white/30'
                  )}
                />
                <LiquidGlassBubble2
                  label={`Interested (${interestedList.length})`}
                  icon={<Star className="w-4 h-4" />}
                  onClick={() => handleRsvp('interested')}
                  disabled={toggleRsvp.isPending}
                  width="100%"
                  height="42px"
                  className={cn(
                    'flex-1',
                    myRsvp?.status === 'interested' && 'opacity-100 [&>div]:!border [&>div]:!border-white/30'
                  )}
                />
              </div>

              {/* Description */}
              {event.description && (
                <div>
                  <h3 className="text-sm font-medium text-white mb-1">Details</h3>
                  <p className="text-sm text-zinc-400 whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              {/* Clickable Attendees */}
              {(goingList.length > 0 || interestedList.length > 0) && (
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">Guests</h3>
                  <div className="flex gap-4 text-xs text-zinc-400">
                    <button
                      onClick={() => setAttendeesType('going')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {goingList.length} going
                    </button>
                    <button
                      onClick={() => setAttendeesType('interested')}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {interestedList.length} interested
                    </button>
                  </div>
                </div>
              )}

              {/* Chat toggle */}
              <button
                onClick={() => setShowChat(!showChat)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-400 text-sm hover:text-white transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                {showChat ? 'Hide Chat' : 'Event Chat'}
              </button>

              {/* Inline Chat */}
              {showChat && (
                <div className="border border-white/[0.08] rounded-xl overflow-hidden">
                  <EventChat eventId={event.id} />
                </div>
              )}

              {/* Creator info + delete */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <CreatorInfo event={event} />
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

      {/* Attendees drawer */}
      {attendeesType && (
        <EventAttendeesDrawer
          eventId={event.id}
          type={attendeesType}
          open={!!attendeesType}
          onOpenChange={(o) => { if (!o) setAttendeesType(null); }}
        />
      )}
    </>
  );
}
