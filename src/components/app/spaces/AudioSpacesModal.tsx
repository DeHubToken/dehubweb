/**
 * AudioSpacesModal - Twitter Spaces-like audio rooms
 * 
 * MVP Features:
 * - Create a new audio space
 * - Browse live spaces
 * - Join as listener
 * - Host controls for speakers
 * - Raise hand to become speaker
 */

import { useState } from 'react';
import { 
  Mic, MicOff, Radio, Users, Hand, X, 
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
      // Confirm before leaving
      if (window.confirm('Leave this space?')) {
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
      if (window.confirm('End this space for everyone?')) {
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
      <DrawerContent className="bg-zinc-900 border-zinc-800 max-h-[90vh]">
        <DrawerHeader className="border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-purple-400" />
              {currentSpace ? currentSpace.title : 'Audio Spaces'}
            </DrawerTitle>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 p-4">
          {/* Browse View */}
          {view === 'browse' && !currentSpace && (
            <div className="space-y-4">
              {/* Start Space Button */}
              {isAuthenticated && (
                <Button 
                  onClick={() => setView('create')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Radio className="w-4 h-4 mr-2" />
                  Start a Space
                </Button>
              )}

              {/* Live Spaces */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-400">Live Now</h3>
                
                {liveSpaces.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <Radio className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No live spaces right now</p>
                    <p className="text-sm">Be the first to start one!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveSpaces.map((space) => (
                      <SpaceCard
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
              <Button 
                variant="ghost" 
                onClick={() => setView('browse')}
                className="text-zinc-400"
              >
                ← Back
              </Button>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">Space Title *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What's this space about?"
                    className="bg-zinc-800 border-zinc-700"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">Description (optional)</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add more details..."
                    className="bg-zinc-800 border-zinc-700 resize-none"
                    rows={3}
                    maxLength={280}
                  />
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={!title.trim() || isLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4 mr-2" />
                  )}
                  Go Live
                </Button>
              </div>
            </div>
          )}

          {/* Live View */}
          {(view === 'live' || currentSpace) && currentSpace && (
            <div className="space-y-4">
              {/* Space Info */}
              <div className="text-center pb-4 border-b border-zinc-800">
                <div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                  </span>
                  LIVE
                </div>
                <h2 className="text-lg font-semibold text-white">{currentSpace.title}</h2>
                {currentSpace.description && (
                  <p className="text-sm text-zinc-400 mt-1">{currentSpace.description}</p>
                )}
                <div className="flex items-center justify-center gap-4 mt-2 text-sm text-zinc-500">
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
                <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
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
                <div className="space-y-2 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <h3 className="text-sm font-medium text-purple-400 flex items-center gap-2">
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
                  <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Listeners ({listeners.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listeners.slice(0, 20).map((listener) => (
                      <Avatar key={listener.id} className="w-8 h-8">
                        <AvatarImage src={listener.avatar || undefined} />
                        <AvatarFallback className="bg-zinc-700 text-xs">
                          {listener.username?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {listeners.length > 20 && (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">
                        +{listeners.length - 20}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900 border-t border-zinc-800">
                <div className="flex items-center justify-center gap-4 max-w-md mx-auto">
                  {/* Mute Button (speakers only) */}
                  {(myRole === 'host' || myRole === 'speaker') && (
                    <Button
                      onClick={toggleMute}
                      size="lg"
                      className={cn(
                        "rounded-full w-14 h-14",
                        isMuted 
                          ? "bg-zinc-700 hover:bg-zinc-600" 
                          : "bg-purple-600 hover:bg-purple-700"
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
                      className="rounded-full"
                    >
                      <Hand className="w-5 h-5 mr-2" />
                      Raise Hand
                    </Button>
                  )}

                  {/* Leave/End Button */}
                  <Button
                    onClick={handleEndOrLeave}
                    size="lg"
                    className="rounded-full bg-red-600 hover:bg-red-700 w-14 h-14"
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

// Space Card Component
function SpaceCard({ 
  space, 
  onJoin, 
  isLoading 
}: { 
  space: AudioSpace; 
  onJoin: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-4 bg-zinc-800 rounded-xl border border-zinc-700 hover:border-purple-500/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span className="text-xs text-purple-400 font-medium">LIVE</span>
          </div>
          <h4 className="font-medium text-white truncate">{space.title}</h4>
          {space.description && (
            <p className="text-sm text-zinc-400 line-clamp-2 mt-1">{space.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm text-zinc-500">
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
          className="bg-purple-600 hover:bg-purple-700 shrink-0"
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
        !participant.is_muted && "ring-2 ring-purple-500 ring-offset-2 ring-offset-zinc-900"
      )}>
        <Avatar className="w-12 h-12">
          <AvatarImage src={participant.avatar || undefined} />
          <AvatarFallback className="bg-zinc-700">
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
      <span className="text-xs text-zinc-400 truncate max-w-full">
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
    <div className="flex items-center justify-between gap-2 p-2 bg-zinc-800 rounded-lg">
      <div className="flex items-center gap-2">
        <Avatar className="w-8 h-8">
          <AvatarImage src={request.avatar || undefined} />
          <AvatarFallback className="bg-zinc-700 text-xs">
            {request.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-white">{request.username || 'Anonymous'}</span>
      </div>
      <Button onClick={onApprove} size="sm" className="bg-purple-600 hover:bg-purple-700">
        Approve
      </Button>
    </div>
  );
}
