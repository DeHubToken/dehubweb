/**
 * AudioSpacesModal - Twitter Spaces-like audio rooms (Stages)
 *
 * MVP Features:
 * - Create a new audio stage
 * - Browse live stages
 * - Join as listener
 * - Host controls for speakers
 * - Raise hand to become speaker
 */

import { useState, useEffect } from 'react';
import {
  Mic, MicOff, Users, Hand, X, ChevronLeft,
  Loader2, Phone, PhoneOff, Crown, Volume2, Radio
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAudioSpaces } from '@/hooks/use-audio-spaces';
import { useAuth } from '@/contexts/AuthContext';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import type { AudioSpace, SpaceParticipant, RaiseHandRequest } from '@/types/audio-spaces.types';

interface AudioSpacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: View;
}

type View = 'browse' | 'create' | 'live';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function AudioSpacesModal({ isOpen, onClose, initialView }: AudioSpacesModalProps) {
  const isDesktop = useIsDesktop();
  const { isAuthenticated } = useAuth();
  const {
    liveSpaces,
    currentSpace,
    participants,
    handRequests,
    isLoading,
    isMuted,
    myRole,
    hasRaisedHand,
    createSpace,
    joinSpace,
    leaveSpace,
    endSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker,
  } = useAudioSpaces();

  const [view, setView] = useState<View>(initialView ?? 'browse');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) setView(initialView ?? 'browse');
  }, [isOpen, initialView]);

  const handleClose = () => {
    if (currentSpace) {
      if (window.confirm('Leave this stage?')) {
        leaveSpace();
        setView('browse');
        onClose();
      }
    } else {
      setView('browse');
      onClose();
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    const space = await createSpace(title.trim(), description.trim() || undefined);
    if (space) {
      setTitle('');
      setDescription('');
      setView('live');
    }
  };

  const handleJoin = async (spaceId: string) => {
    const success = await joinSpace(spaceId);
    if (success) setView('live');
  };

  const handleEndOrLeave = () => {
    if (myRole === 'host') {
      if (window.confirm('End this stage for everyone?')) {
        endSpace();
        setView('browse');
      }
    } else {
      leaveSpace();
      setView('browse');
    }
  };

  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter(p => p.role === 'listener');

  const content = (
    <ModalContent
      view={view}
      setView={setView}
      isAuthenticated={isAuthenticated}
      liveSpaces={liveSpaces}
      currentSpace={currentSpace}
      participants={participants}
      speakers={speakers}
      listeners={listeners}
      handRequests={handRequests}
      isLoading={isLoading}
      isMuted={isMuted}
      myRole={myRole}
      hasRaisedHand={hasRaisedHand}
      title={title}
      setTitle={setTitle}
      description={description}
      setDescription={setDescription}
      handleCreate={handleCreate}
      handleJoin={handleJoin}
      handleEndOrLeave={handleEndOrLeave}
      handleClose={handleClose}
      toggleMute={toggleMute}
      raiseHand={raiseHand}
      lowerHand={lowerHand}
      approveSpeaker={approveSpeaker}
      removeSpeaker={removeSpeaker}
      isDesktop={isDesktop}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className={cn(
            "bg-black/70 backdrop-blur-[32px] saturate-[180%] border-white/10 text-white p-0 gap-0 overflow-hidden",
            (view === 'live' || currentSpace) ? "max-w-2xl" : "max-w-lg"
          )}
          style={{ borderRadius: '20px' }}
        >
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-white/10 max-h-[90vh] [&>div:first-child]:hidden">
        {content}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Inner content (shared between Dialog + Drawer) ──────────────────────────

interface ModalContentProps {
  view: View;
  setView: (v: View) => void;
  isAuthenticated: boolean;
  liveSpaces: AudioSpace[];
  currentSpace: AudioSpace | null;
  participants: SpaceParticipant[];
  speakers: SpaceParticipant[];
  listeners: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  isLoading: boolean;
  isMuted: boolean;
  myRole: string | null;
  hasRaisedHand: boolean;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  handleCreate: () => void;
  handleJoin: (id: string) => void;
  handleEndOrLeave: () => void;
  handleClose: () => void;
  toggleMute: () => void;
  raiseHand: () => void;
  lowerHand: () => void;
  approveSpeaker: (w: string) => void;
  removeSpeaker: (w: string) => void;
  isDesktop: boolean;
}

function ModalContent({
  view, setView, isAuthenticated,
  liveSpaces, currentSpace,
  speakers, listeners, handRequests,
  isLoading, isMuted, myRole, hasRaisedHand,
  title, setTitle, description, setDescription,
  handleCreate, handleJoin, handleEndOrLeave, handleClose,
  toggleMute, raiseHand, lowerHand, approveSpeaker, removeSpeaker,
  isDesktop,
}: ModalContentProps) {
  const isLive = (view === 'live' || !!currentSpace) && !!currentSpace;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-5 py-4 shrink-0",
        isLive ? "border-b border-white/10" : ""
      )}>
        {/* Left: back or icon */}
        <div className="flex items-center gap-2.5">
          {view === 'create' && !currentSpace ? (
            <button
              onClick={() => setView('browse')}
              className="text-white/60 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <img src={stagesMicIcon} alt="" className="w-6 h-6 object-contain" />
          )}
          <span className="text-white font-semibold text-base">
            {currentSpace ? currentSpace.title : view === 'create' ? 'New Stage' : 'Stages'}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-500/25">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      {isLive ? (
        <LiveView
          currentSpace={currentSpace!}
          speakers={speakers}
          listeners={listeners}
          handRequests={handRequests}
          myRole={myRole}
          isMuted={isMuted}
          hasRaisedHand={hasRaisedHand}
          toggleMute={toggleMute}
          raiseHand={raiseHand}
          lowerHand={lowerHand}
          approveSpeaker={approveSpeaker}
          removeSpeaker={removeSpeaker}
          handleEndOrLeave={handleEndOrLeave}
          isDesktop={isDesktop}
        />
      ) : view === 'create' ? (
        <CreateView
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          handleCreate={handleCreate}
          isLoading={isLoading}
          setView={setView}
        />
      ) : (
        <BrowseView
          isAuthenticated={isAuthenticated}
          liveSpaces={liveSpaces}
          isLoading={isLoading}
          setView={setView}
          handleJoin={handleJoin}
        />
      )}
    </div>
  );
}

// ─── Browse View ──────────────────────────────────────────────────────────────

function BrowseView({ isAuthenticated, liveSpaces, isLoading, setView, handleJoin }: {
  isAuthenticated: boolean;
  liveSpaces: AudioSpace[];
  isLoading: boolean;
  setView: (v: View) => void;
  handleJoin: (id: string) => void;
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-5 space-y-4">
        {isAuthenticated && (
          <button
            onClick={() => setView('create')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/10 group-hover:bg-white/15 flex items-center justify-center transition-colors">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-sm">Start a Stage</p>
              <p className="text-white/40 text-xs">Go live with audio</p>
            </div>
          </button>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-0.5">Live Now</p>
          {liveSpaces.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <img src={stagesMicIcon} alt="" className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-white/60">No stages live</p>
              <p className="text-xs mt-1">Be the first to start one!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {liveSpaces.map((space) => (
                <StageCard key={space.id} space={space} onJoin={() => handleJoin(space.id)} isLoading={isLoading} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── Create View ──────────────────────────────────────────────────────────────

function CreateView({ title, setTitle, description, setDescription, handleCreate, isLoading, setView }: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  handleCreate: () => void;
  isLoading: boolean;
  setView: (v: View) => void;
}) {
  return (
    <div className="flex-1 p-5 space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Stage Title *</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's this stage about?"
          className="bg-white/8 border-white/10 text-white placeholder:text-white/30 rounded-xl focus-visible:ring-white/20 h-11"
          maxLength={100}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Description <span className="normal-case">(optional)</span></label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details..."
          className="bg-white/8 border-white/10 text-white placeholder:text-white/30 rounded-xl resize-none focus-visible:ring-white/20"
          rows={3}
          maxLength={280}
        />
      </div>
      <Button
        onClick={handleCreate}
        disabled={!title.trim() || isLoading}
        className="w-full h-11 bg-white text-black hover:bg-white/90 font-semibold rounded-xl"
      >
        {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mic className="w-4 h-4 mr-2" />}
        Go Live
      </Button>
    </div>
  );
}

// ─── Live View ────────────────────────────────────────────────────────────────

function LiveView({
  currentSpace, speakers, listeners, handRequests,
  myRole, isMuted, hasRaisedHand,
  toggleMute, raiseHand, lowerHand, approveSpeaker, removeSpeaker,
  handleEndOrLeave, isDesktop,
}: {
  currentSpace: AudioSpace;
  speakers: SpaceParticipant[];
  listeners: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  myRole: string | null;
  isMuted: boolean;
  hasRaisedHand: boolean;
  toggleMute: () => void;
  raiseHand: () => void;
  lowerHand: () => void;
  approveSpeaker: (w: string) => void;
  removeSpeaker: (w: string) => void;
  handleEndOrLeave: () => void;
  isDesktop: boolean;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          {/* Stage description */}
          {currentSpace.description && (
            <p className="text-sm text-white/50 leading-relaxed">{currentSpace.description}</p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              {speakers.length} speaking
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {listeners.length} listening
            </span>
          </div>

          {/* Speakers grid */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">On Stage</p>
            <div className={cn(
              "grid gap-4",
              isDesktop ? "grid-cols-5" : "grid-cols-4"
            )}>
              {speakers.map((speaker) => (
                <ParticipantAvatar
                  key={speaker.id}
                  participant={speaker}
                  isHost={speaker.role === 'host'}
                  canRemove={myRole === 'host' && speaker.role === 'speaker'}
                  onRemove={() => removeSpeaker(speaker.wallet_address)}
                />
              ))}
            </div>
          </div>

          {/* Hand requests */}
          {myRole === 'host' && handRequests.length > 0 && (
            <div className="space-y-2 p-3.5 bg-yellow-500/8 rounded-2xl border border-yellow-500/20">
              <p className="text-xs font-semibold text-yellow-400/80 uppercase tracking-wider flex items-center gap-1.5">
                <Hand className="w-3.5 h-3.5" />
                Requests to Speak ({handRequests.length})
              </p>
              <div className="space-y-1.5">
                {handRequests.map((req) => (
                  <HandRequestItem key={req.id} request={req} onApprove={() => approveSpeaker(req.wallet_address)} />
                ))}
              </div>
            </div>
          )}

          {/* Listeners */}
          {listeners.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Listening · {listeners.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {listeners.slice(0, isDesktop ? 30 : 20).map((listener) => (
                  <Avatar key={listener.id} className="w-8 h-8 ring-1 ring-white/10">
                    <AvatarImage src={listener.avatar || undefined} />
                    <AvatarFallback className="bg-white/10 text-white text-xs">
                      {listener.username?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {listeners.length > (isDesktop ? 30 : 20) && (
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/50 font-medium ring-1 ring-white/10">
                    +{listeners.length - (isDesktop ? 30 : 20)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Controls — contained in modal on desktop, fixed bar on mobile */}
      <div className={cn(
        "shrink-0 border-t border-white/10",
        isDesktop
          ? "px-5 py-4"
          : "px-4 py-4 bg-black/60 backdrop-blur-[24px]"
      )}>
        <div className="flex items-center justify-between gap-3">
          {/* Left: mute or raise hand */}
          <div className="flex-1 flex justify-start">
            {(myRole === 'host' || myRole === 'speaker') ? (
              <button
                onClick={toggleMute}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  isMuted
                    ? "bg-white/10 hover:bg-white/15 text-white/70"
                    : "bg-white/20 hover:bg-white/25 text-white ring-1 ring-white/20"
                )}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            ) : myRole === 'listener' ? (
              <button
                onClick={hasRaisedHand ? lowerHand : raiseHand}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  hasRaisedHand
                    ? "bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 ring-1 ring-yellow-500/30"
                    : "bg-white/10 hover:bg-white/15 text-white/70"
                )}
              >
                <Hand className="w-4 h-4" />
                {hasRaisedHand ? 'Lower Hand' : 'Raise Hand'}
              </button>
            ) : null}
          </div>

          {/* Right: leave/end */}
          <button
            onClick={handleEndOrLeave}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
              myRole === 'host'
                ? "bg-red-500/80 hover:bg-red-500 text-white"
                : "bg-white/10 hover:bg-white/15 text-white/70"
            )}
          >
            {myRole === 'host' ? (
              <><PhoneOff className="w-4 h-4" /> End Stage</>
            ) : (
              <><Phone className="w-4 h-4" /> Leave</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage Card ───────────────────────────────────────────────────────────────

function StageCard({ space, onJoin, isLoading }: {
  space: AudioSpace;
  onJoin: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/8 hover:border-white/16 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white text-sm leading-snug">{space.title}</h4>
          {space.description && (
            <p className="text-xs text-white/40 line-clamp-1 mt-0.5">{space.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Crown className="w-3 h-3" />
              {space.host_username || 'Anonymous'}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {(space.speaker_count || 0) + (space.listener_count || 0)}
            </span>
          </div>
        </div>
        <Button
          onClick={onJoin}
          disabled={isLoading}
          size="sm"
          className="bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl h-8 px-3 text-xs shrink-0"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Join'}
        </Button>
      </div>
    </div>
  );
}

// ─── Participant Avatar ───────────────────────────────────────────────────────

function ParticipantAvatar({ participant, isHost, canRemove, onRemove }: {
  participant: SpaceParticipant;
  isHost: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 group relative">
      <div className={cn(
        "relative rounded-full",
        !participant.is_muted && "ring-2 ring-white/40 ring-offset-2 ring-offset-black/60"
      )}>
        <Avatar className="w-14 h-14">
          <AvatarImage src={participant.avatar || undefined} />
          <AvatarFallback className="bg-white/10 text-white text-base">
            {participant.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isHost && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center shadow-sm">
            <Crown className="w-2.5 h-2.5 text-yellow-900" />
          </div>
        )}
        {participant.is_muted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center">
            <MicOff className="w-2.5 h-2.5 text-white/60" />
          </div>
        )}
      </div>
      <span className="text-[11px] text-white/50 truncate max-w-full px-1 text-center leading-tight">
        {participant.username || 'Anonymous'}
      </span>
      {canRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex shadow-sm"
        >
          <X className="w-2.5 h-2.5 text-white" />
        </button>
      )}
    </div>
  );
}

// ─── Hand Request Item ────────────────────────────────────────────────────────

function HandRequestItem({ request, onApprove }: {
  request: RaiseHandRequest;
  onApprove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex items-center gap-2.5">
        <Avatar className="w-7 h-7">
          <AvatarImage src={request.avatar || undefined} />
          <AvatarFallback className="bg-white/10 text-white text-xs">
            {request.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-white/80">{request.username || 'Anonymous'}</span>
      </div>
      <button
        onClick={onApprove}
        className="text-xs font-medium px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        Approve
      </button>
    </div>
  );
}
