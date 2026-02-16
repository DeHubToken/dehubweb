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

import { useState } from 'react';
import { 
  Mic, MicOff, Users, Hand, X, ChevronLeft,
  Loader2, Phone, PhoneOff, Crown, Volume2 
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
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
}

type View = 'browse' | 'create' | 'live';

export function AudioSpacesModal({ isOpen, onClose }: AudioSpacesModalProps) {
  const { isAuthenticated } = useAuth();
  const {
    liveSpaces,
    currentSpace,
    participants,
    handRequests,
    isLoading,
    isConnected,
    isMuted,
    myRole,
    createSpace,
    joinSpace,
    leaveSpace,
    endSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker
  } = useAudioSpaces();

  const [view, setView] = useState<View>('browse');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

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
    if (success) {
      setView('live');
    }
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

  // Get speakers and listeners
  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter(p => p.role === 'listener');

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DrawerContent className="bg-black/60 backdrop-blur-[24px] saturate-[180%] border-white/10 max-h-[90vh] [&>div:first-child]:hidden">
        <DrawerHeader className="border-b-0 pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-white flex items-center gap-2">
              <img src={stagesMicIcon} alt="" className="w-7 h-7 object-contain" />
              {currentSpace ? currentSpace.title : 'Stages'}
            </DrawerTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-xl text-white hover:bg-white/10">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 p-4">
          {/* Browse View */}
          {view === 'browse' && !currentSpace && (
            <div className="space-y-4">
              {/* Start Stage Button */}
              {isAuthenticated && (
                <Button 
                  onClick={() => setView('create')}
                  className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl"
                >
                  <Mic className="w-4 h-4 mr-2" />
                  Start a Stage
                </Button>
              )}

              {/* Live Stages */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white/60">Live Now</h3>
                
                {liveSpaces.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    <img src={stagesMicIcon} alt="" className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-white">No stages</p>
                    <p className="text-sm text-white/50">Be the first to start one!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveSpaces.map((space) => (
                      <StageCard
                        key={space.id}
                        space={space}
                        onJoin={() => handleJoin(space.id)}
                        isLoading={isLoading}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Create View */}
          {view === 'create' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-white/60">Stage Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's this stage about?"
                  className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-white/60">Description (optional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add more details..."
                  className="bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl resize-none"
                  rows={3}
                  maxLength={280}
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={!title.trim() || isLoading}
                className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4 mr-2" />
                )}
                Go Live
              </Button>

              <Button 
                variant="ghost" 
                onClick={() => setView('browse')}
                className="w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          )}

          {/* Live View */}
          {(view === 'live' || currentSpace) && currentSpace && (
            <div className="space-y-4 pb-20">
              {/* Stage Info */}
              <div className="text-center pb-4">
                <div className="flex items-center justify-center gap-2 text-white mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-xs font-medium">LIVE</span>
                </div>
                <h2 className="text-lg font-semibold text-white">{currentSpace.title}</h2>
                {currentSpace.description && (
                  <p className="text-sm text-white/60 mt-1">{currentSpace.description}</p>
                )}
                <div className="flex items-center justify-center gap-4 mt-2 text-sm text-white/50">
                  <span className="flex items-center gap-1">
                    <Volume2 className="w-4 h-4" />
                    {speakers.length} speaking
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {listeners.length} listening
                  </span>
                </div>
              </div>

              {/* Speakers Section */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Speakers
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
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

              {/* Hand Requests (Host only) */}
              {myRole === 'host' && handRequests.length > 0 && (
                <div className="space-y-2 p-3 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <Hand className="w-4 h-4" />
                    Requests to Speak ({handRequests.length})
                  </h3>
                  <div className="space-y-2">
                    {handRequests.map((request) => (
                      <HandRequestItem
                        key={request.id}
                        request={request}
                        onApprove={() => approveSpeaker(request.wallet_address)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Listeners Section */}
              {listeners.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Listeners ({listeners.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listeners.slice(0, 20).map((listener) => (
                      <Avatar key={listener.id} className="w-8 h-8">
                        <AvatarImage src={listener.avatar || undefined} />
                        <AvatarFallback className="bg-white/10 text-white text-xs">
                          {listener.username?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {listeners.length > 20 && (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                        +{listeners.length - 20}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/60 backdrop-blur-[24px] border-t border-white/10">
                <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
                  {/* Mute Button (speakers only) */}
                  {(myRole === 'host' || myRole === 'speaker') && (
                    <Button
                      onClick={toggleMute}
                      size="lg"
                      className={cn(
                        "rounded-full w-14 h-14",
                        isMuted 
                          ? "bg-white/10 hover:bg-white/20 text-white" 
                          : "bg-white/20 hover:bg-white/30 text-white"
                      )}
                    >
                      {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </Button>
                  )}

                  {/* Raise Hand (listeners only) */}
                  {myRole === 'listener' && (
                    <Button
                      onClick={raiseHand}
                      size="lg"
                      variant="outline"
                      className="rounded-full bg-white/10 hover:bg-white/20 border-white/10 text-white"
                    >
                      <Hand className="w-5 h-5 mr-2" />
                      Raise Hand
                    </Button>
                  )}

                  {/* Leave/End Button */}
                  <Button
                    onClick={handleEndOrLeave}
                    size="lg"
                    className="rounded-full bg-red-500/80 hover:bg-red-500 w-14 h-14 text-white"
                  >
                    {myRole === 'host' ? (
                      <PhoneOff className="w-6 h-6" />
                    ) : (
                      <Phone className="w-6 h-6" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

// Stage Card Component
function StageCard({ 
  space, 
  onJoin, 
  isLoading 
}: { 
  space: AudioSpace; 
  onJoin: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-xs text-white font-medium">LIVE</span>
          </div>
          <h4 className="font-medium text-white truncate">{space.title}</h4>
          {space.description && (
            <p className="text-sm text-white/50 line-clamp-2 mt-1">{space.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm text-white/50">
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
          className="bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl shrink-0"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
        </Button>
      </div>
    </div>
  );
}

// Participant Avatar Component
function ParticipantAvatar({ 
  participant, 
  isHost,
  canRemove,
  onRemove
}: { 
  participant: SpaceParticipant;
  isHost: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 group relative">
      <div className={cn(
        "relative rounded-full p-0.5",
        !participant.is_muted && "ring-2 ring-white/50 ring-offset-2 ring-offset-black/60"
      )}>
        <Avatar className="w-12 h-12">
          <AvatarImage src={participant.avatar || undefined} />
          <AvatarFallback className="bg-white/10 text-white">
            {participant.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isHost && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
            <Crown className="w-3 h-3 text-yellow-900" />
          </div>
        )}
        {participant.is_muted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <MicOff className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <span className="text-xs text-white/60 truncate max-w-full">
        {participant.username || 'Anonymous'}
      </span>
      {canRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

// Hand Request Item Component
function HandRequestItem({ 
  request, 
  onApprove 
}: { 
  request: RaiseHandRequest;
  onApprove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-xl">
      <div className="flex items-center gap-2">
        <Avatar className="w-8 h-8">
          <AvatarImage src={request.avatar || undefined} />
          <AvatarFallback className="bg-white/10 text-white text-xs">
            {request.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-white">{request.username || 'Anonymous'}</span>
      </div>
      <Button onClick={onApprove} size="sm" className="bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl">
        Approve
      </Button>
    </div>
  );
}
