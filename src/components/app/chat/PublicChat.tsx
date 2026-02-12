import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Settings, MoreVertical, MessageCircle, Loader2, Users, Pin, ShieldBan, ShieldCheck, MessageSquarePlus, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage, Message } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { CreateTopicRoomModal } from './CreateTopicRoomModal';
import { RoomSettingsModal } from './RoomSettingsModal';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatRoomDetails } from '@/hooks/use-livechat';
import { getMediaUrl, pinLiveChatMessage, unpinLiveChatMessage, banLiveChatUser, unbanLiveChatUser, type LiveChatMessage as ApiMessage, type LiveChatRoom } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PublicChatProps {
  onBack: () => void;
}

/** Map API livechat message to local ChatMessage format */
function toLocalMessage(msg: ApiMessage): Message {
  return {
    id: msg.id,
    userId: msg.sender?.address || 'unknown',
    userName: msg.sender?.displayName || msg.sender?.username || msg.sender?.address?.slice(0, 8) || 'Anon',
    userAvatar: getMediaUrl(msg.sender?.avatarImageUrl) || undefined,
    content: msg.content || '',
    timestamp: new Date(msg.createdAt),
    type: (msg.type as Message['type']) || 'text',
    imageUrl: msg.imageUrl ? getMediaUrl(msg.imageUrl) : undefined,
    isPinned: msg.isPinned || false,
  };
}

export function PublicChat({ onBack }: PublicChatProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();

  // Fetch rooms, use the first available room
  const { rooms, isLoading: roomsLoading, error: roomsError, refetch: refetchRooms } = useLiveChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-select the first room once loaded
  useEffect(() => {
    if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const { messages: apiMessages, isLoading: messagesLoading, isSending, send, refetch } = useLiveChatMessages(selectedRoomId);

  // Fetch full room details (description, moderators, messageCount) for the selected room
  const { room: roomDetails } = useLiveChatRoomDetails(selectedRoomId);

  // Convert API messages to local format
  const messages: Message[] = apiMessages.map(toLocalMessage);

  // Find pinned message
  const pinnedMessage = messages.find(m => m.isPinned);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  const handleSendMessage = async (content: string, type: 'text' | 'image' | 'gif', imageUrl?: string) => {
    if (!isAuthenticated) {
      toast.error('Sign in to send messages');
      return;
    }
    try {
      await send(content, type, imageUrl);
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handlePinMessage = useCallback(async (messageId: string) => {
    if (!selectedRoomId || !isAuthenticated) {
      toast.error('Sign in to moderate');
      return;
    }
    try {
      await pinLiveChatMessage(selectedRoomId, messageId);
      toast.success('Message pinned');
      refetch();
    } catch (err) {
      console.error('[PublicChat] Pin failed:', err);
      toast.error('Failed to pin message');
    }
  }, [selectedRoomId, isAuthenticated, refetch]);

  const handleUnpinMessage = useCallback(async (messageId: string) => {
    if (!selectedRoomId || !isAuthenticated) return;
    try {
      await unpinLiveChatMessage(selectedRoomId, messageId);
      toast.success('Message unpinned');
      refetch();
    } catch (err) {
      console.error('[PublicChat] Unpin failed:', err);
      toast.error('Failed to unpin message');
    }
  }, [selectedRoomId, isAuthenticated, refetch]);

  const handleBanUser = useCallback(async (userId: string, userName: string) => {
    if (!selectedRoomId || !isAuthenticated) {
      toast.error('Sign in to moderate');
      return;
    }
    try {
      await banLiveChatUser(selectedRoomId, userId);
      toast.success(`${userName} has been banned`);
      refetch();
    } catch (err) {
      console.error('[PublicChat] Ban failed:', err);
      toast.error('Failed to ban user');
    }
  }, [selectedRoomId, isAuthenticated, refetch]);

  const handleUnbanUser = useCallback(async (userId: string, userName: string) => {
    if (!selectedRoomId || !isAuthenticated) {
      toast.error('Sign in to moderate');
      return;
    }
    try {
      await unbanLiveChatUser(selectedRoomId, userId);
      toast.success(`${userName} has been unbanned`);
      refetch();
    } catch (err) {
      console.error('[PublicChat] Unban failed:', err);
      toast.error('Failed to unban user');
    }
  }, [selectedRoomId, isAuthenticated, refetch]);

  // Merge list-level room data with the richer single-room details
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;
  const enrichedRoom = roomDetails || selectedRoom;
  const isLoading = roomsLoading || messagesLoading;
  const roomName = enrichedRoom?.name || enrichedRoom?.topic || 'Public Chat';
  const roomDescription = enrichedRoom?.description;

  const handleRoomCreated = useCallback((room: LiveChatRoom) => {
    refetchRooms();
    setSelectedRoomId(room.id);
  }, [refetchRooms]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div className="min-w-0">
            <h2 className="font-bold text-white truncate">{roomName}</h2>
            {roomDescription ? (
              <p className="text-zinc-500 text-xs truncate max-w-[180px]" title={roomDescription}>
                {roomDescription}
              </p>
            ) : rooms.length > 0 ? (
              <span className="text-zinc-500 text-xs flex items-center gap-1">
                <Users className="w-3 h-3" />
                {enrichedRoom?.participantCount ?? 0} online
              </span>
            ) : null}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Room selector for multiple rooms */}
          {rooms.length > 1 && (
            <select
              value={selectedRoomId || ''}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="bg-zinc-800 text-white text-xs rounded-lg px-2 py-1 border border-zinc-700"
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name || room.topic || room.id}
                </option>
              ))}
            </select>
          )}
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => setCreateRoomOpen(true)}
              title="Create new room"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={() => setSettingsOpen(true)}
            title="Room settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Pinned message banner */}
      {pinnedMessage && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-sm">
          <Pin className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <span className="text-yellow-200/80 font-medium text-xs truncate">
            {pinnedMessage.userName}: {pinnedMessage.content}
          </span>
          {isAuthenticated && (
            <button
              onClick={() => handleUnpinMessage(pinnedMessage.id)}
              className="ml-auto text-yellow-500/50 hover:text-yellow-300 text-xs flex-shrink-0"
            >
              Unpin
            </button>
          )}
        </div>
      )}
      
      {/* Messages Area */}
      <div className="relative flex-1">
        <div 
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto py-2"
        >
          {roomsError ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <AlertCircle className="w-12 h-12 text-red-500/60" />
              <p className="text-sm text-red-400">Failed to load chat</p>
              <p className="text-xs text-zinc-600">{roomsError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchRooms()}
                className="border-zinc-700 text-white hover:bg-zinc-800 mt-2"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                Try Again
              </Button>
            </div>
          ) : !roomsLoading && rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <MessageCircle className="w-12 h-12 text-zinc-700" />
              <p className="text-sm">No chat rooms available</p>
              <p className="text-xs text-zinc-600">Check back later or create a new room</p>
            </div>
          ) : isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-8 h-8 rounded-full bg-zinc-800" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3 w-24 bg-zinc-800" />
                    <Skeleton className="h-4 w-48 bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <MessageCircle className="w-12 h-12 text-zinc-700" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-zinc-600">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
                showActions={isAuthenticated}
                onPin={handlePinMessage}
                onUnpin={handleUnpinMessage}
                onBan={handleBanUser}
                onUnban={handleUnbanUser}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      
      {/* Input Area */}
      <div className="relative">
        {isSending && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/90 rounded-full px-3 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending...
          </div>
        )}
        <ChatInput onSendMessage={handleSendMessage} />
      </div>

      {/* Modals */}
      <CreateTopicRoomModal
        open={createRoomOpen}
        onOpenChange={setCreateRoomOpen}
        onCreated={handleRoomCreated}
      />
      <RoomSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        room={selectedRoom}
        onUpdated={refetchRooms}
      />
    </div>
  );
}
