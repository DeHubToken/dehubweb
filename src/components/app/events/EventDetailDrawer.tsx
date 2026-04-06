import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { MapPin, Calendar, Users, Flame, Trash2, CheckCircle2, Share2, X, Lock, Globe, Clock, UserCheck, UserX, Pencil } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { useAuth } from '@/contexts/AuthContext';
import { useEventRsvp, useToggleRsvp, useDeleteEvent, useEventRsvps, useManageRsvp } from '@/hooks/use-events';
import type { CommunityEvent, EventRsvp } from '@/hooks/use-events';
import { useHasPaidGate, useEventGatePayment } from '@/hooks/use-event-gate-payment';
import { toast } from 'sonner';
import { EventChat } from './EventChat';
import { EventAttendeesDrawer } from './EventAttendeesDrawer';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { buildAvatarUrl } from '@/lib/media-url';
import { useNavigate } from 'react-router-dom';
import dehubCoin from '@/assets/dehub-coin.png';
import { FriendsAtEvent } from './FriendsAtEvent';
import { EditEventDrawer } from './EditEventDrawer';

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

function PendingRequestItem({ rsvp, eventId, onManage }: { rsvp: EventRsvp; eventId: string; onManage: (rsvpId: string, status: 'approved' | 'denied') => void }) {
  const addr = rsvp.wallet_address;
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="w-7 h-7">
          <AvatarImage src={buildAvatarUrl(addr, undefined)} />
          <AvatarFallback className="bg-zinc-700 text-white text-[9px]">{addr.slice(2, 4).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-zinc-300 truncate">{`${addr.slice(0, 6)}...${addr.slice(-4)}`}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onManage(rsvp.id, 'approved')}
          className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
        >
          <UserCheck className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onManage(rsvp.id, 'denied')}
          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <UserX className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
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
  const manageRsvp = useManageRsvp();
  const [showChat, setShowChat] = useState(true);
  const [attendeesType, setAttendeesType] = useState<'going' | 'interested' | null>(null);
  const [showEditDrawer, setShowEditDrawer] = useState(false);

  const hasGateFee = (event?.gate_fee ?? 0) > 0;
  const isPrivate = event?.is_private ?? false;
  const isCreator = walletAddress && event?.creator_wallet_address === walletAddress.toLowerCase();
  const { data: hasPaid = false, isLoading: checkingPayment } = useHasPaidGate(hasGateFee ? event?.id : undefined);
  const isGated = hasGateFee && !isCreator && !hasPaid;

  // Private event access: creator always has access, approved users have access
  const isApproved = myRsvp?.status === 'approved' || myRsvp?.status === 'going';
  const isPending = myRsvp?.status === 'pending';
  const isDenied = myRsvp?.status === 'denied';
  const isPrivateBlocked = isPrivate && !isCreator && !isApproved;

  const { pay: payGateFee, isPaying } = useEventGatePayment({
    eventId: event?.id ?? '',
    creatorAddress: event?.creator_wallet_address ?? '',
    amount: event?.gate_fee ?? 0,
    onSuccess: () => {},
  });

  if (!event) return null;

  const startDate = new Date(event.starts_at);
  const goingList = allRsvps.filter(r => r.status === 'going' || r.status === 'approved');
  const interestedList = allRsvps.filter(r => r.status === 'interested');
  const pendingList = allRsvps.filter(r => r.status === 'pending');

  const handleRsvp = (status: 'going' | 'interested') => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (isGated) {
      toast.error('Pay the entry fee to join this event');
      return;
    }
    if (isPrivate && !isCreator && !isApproved) {
      toast.error('You need to be approved to RSVP');
      return;
    }
    if (myRsvp?.status === status) {
      toggleRsvp.mutate({ eventId: event.id, status: 'remove' });
    } else {
      toggleRsvp.mutate({ eventId: event.id, status });
    }
  };

  const handleRequestAccess = () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (isPending) {
      // Cancel request
      toggleRsvp.mutate({ eventId: event.id, status: 'remove' });
    } else {
      toggleRsvp.mutate({ eventId: event.id, status: 'pending' });
      toast.success('Request sent to the event creator');
    }
  };

  const handleManageRequest = (rsvpId: string, newStatus: 'approved' | 'denied') => {
    manageRsvp.mutate({ rsvpId, eventId: event.id, newStatus });
  };

  const handleDelete = () => {
    deleteEvent.mutate(event.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const canInteract = !isGated && !isPrivateBlocked;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(GLASS_STYLES.drawer, 'max-h-[92vh]')}>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{event.title}</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-y-auto">
            {/* Cover */}
            <div className="h-48 bg-gradient-to-br from-white/5 to-white/10 relative">
              {event.cover_image_url && (
                <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
              )}
              {/* Private badge on cover */}
              {isPrivate && (
                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                  <Lock className="w-3 h-3 text-zinc-300" />
                  <span className="text-[10px] font-medium text-zinc-300">Private</span>
                </div>
              )}
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Date/time + share */}
              <div className="flex items-start gap-3">
                <div className="bg-white/10 rounded-lg px-3 py-2 text-center shrink-0">
                  <div className="text-xs font-bold text-white/70 uppercase">{format(startDate, 'MMM')}</div>
                  <div className="text-xl font-bold text-white">{format(startDate, 'd')}</div>
                </div>
                <div className="flex-1 min-w-0">
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/app/events/${event.id}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Event link copied!');
                    }}
                    className="p-2 rounded-xl bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="p-2 rounded-xl bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Gate Fee Banner */}
              {hasGateFee && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={dehubCoin} alt="Coins" className="w-5 h-5" />
                      <span className="text-sm font-medium text-white">
                        {event.gate_fee} {event.gate_fee === 1 ? 'Coin' : 'Coins'} entry fee
                      </span>
                    </div>
                    {isCreator ? (
                      <span className="text-xs text-zinc-500">You're the creator</span>
                    ) : hasPaid ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={payGateFee}
                        disabled={isPaying || checkingPayment}
                        className="rounded-xl gap-1.5"
                      >
                        {isPaying ? (
                          <span className="animate-spin">⏳</span>
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        Pay to join
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Private Event: Request Access */}
              {isPrivate && !isCreator && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-zinc-400" />
                      <div>
                        <span className="text-sm font-medium text-white">Private event</span>
                        <p className="text-xs text-zinc-500">
                          {isApproved ? 'You\'re approved' : isPending ? 'Request pending' : isDenied ? 'Request denied' : 'Request access to attend'}
                        </p>
                      </div>
                    </div>
                    {isApproved ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                      </span>
                    ) : isPending ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRequestAccess}
                        disabled={toggleRsvp.isPending}
                        className="rounded-xl gap-1.5 border-white/10 text-zinc-300"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </Button>
                    ) : isDenied ? (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <UserX className="w-3.5 h-3.5" /> Denied
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleRequestAccess}
                        disabled={toggleRsvp.isPending}
                        className="rounded-xl gap-1.5"
                      >
                        Request Access
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Creator: Pending Requests */}
              {isCreator && isPrivate && pendingList.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                  <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Pending Requests ({pendingList.length})
                  </h3>
                  <div className="divide-y divide-white/[0.06]">
                    {pendingList.map((rsvp) => (
                      <PendingRequestItem
                        key={rsvp.id}
                        rsvp={rsvp}
                        eventId={event.id}
                        onManage={handleManageRequest}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* RSVP Buttons */}
              <div className="flex gap-2">
                <LiquidGlassBubble2
                  label={`Going (${goingList.length})`}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => handleRsvp('going')}
                  disabled={toggleRsvp.isPending || !canInteract}
                  width="100%"
                  height="42px"
                  className={cn(
                    'flex-1',
                    !canInteract && 'opacity-50',
                    myRsvp?.status === 'going' && 'opacity-100 [&>div]:!border [&>div]:!border-white/30'
                  )}
                />
                <LiquidGlassBubble2
                  label={`Interested (${interestedList.length})`}
                  icon={<Flame className="w-4 h-4" />}
                  onClick={() => handleRsvp('interested')}
                  disabled={toggleRsvp.isPending || !canInteract}
                  width="100%"
                  height="42px"
                  className={cn(
                    'flex-1',
                    !canInteract && 'opacity-50',
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-white">Guests</h3>
                    <FriendsAtEvent eventId={event.id} mode="inline" />
                  </div>
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
                      <Flame className="w-3.5 h-3.5" />
                      {interestedList.length} interested
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Chat — hidden behind gate or private block */}
              {showChat && canInteract && (
                <div className="border border-white/[0.08] rounded-xl overflow-hidden">
                  <EventChat eventId={event.id} />
                </div>
              )}

              {(isGated || isPrivateBlocked) && (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  <Lock className="w-5 h-5 mx-auto mb-2 text-zinc-600" />
                  {isGated
                    ? 'Pay the entry fee to access the chat and RSVP'
                    : isPending
                    ? 'Your request is pending — the creator will review it'
                    : isDenied
                    ? 'Your request was denied'
                    : 'Request access to view the chat and RSVP'
                  }
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
