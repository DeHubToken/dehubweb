import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ArrowLeft, Settings, MoreVertical, MessageCircle, Loader2, Users, Pin, ShieldBan, ShieldCheck, MessageSquarePlus, AlertCircle, RefreshCw, Search, X, Languages, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChatMessage, Message } from './ChatMessage';
import { TranslatableText, SharedTranslationContext } from '../TranslatableText';
import { ChatInput } from './ChatInput';
import { CreateTopicRoomModal } from './CreateTopicRoomModal';
import { RoomSettingsModal } from './RoomSettingsModal';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatRoomDetails, useLiveChatPresence, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { getMediaUrl, pinLiveChatMessage, unpinLiveChatMessage, banLiveChatUser, unbanLiveChatUser, type LiveChatRoom } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
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

/** Map Supabase livechat message to local ChatMessage format */
function toLocalMessage(msg: SupabaseLiveChatMessage): Message {
  return {
    id: msg.id,
    userId: msg.sender_address || 'unknown',
    userName: msg.sender_display_name || msg.sender_username || msg.sender_address?.slice(0, 8) || 'Anon',
    userHandle: msg.sender_username || undefined,
    userAvatar: buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url) || undefined,
    content: msg.content || '',
    timestamp: new Date(msg.created_at),
    type: (msg.message_type as Message['type']) || 'text',
    imageUrl: msg.image_url ? getMediaUrl(msg.image_url) : undefined,
    isPinned: msg.is_pinned || false,
  };
}

export function PublicChat({ onBack }: PublicChatProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, walletAddress } = useAuth();

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Translation state
  const [translateSignal, setTranslateSignal] = useState(0);
  const [originalSignal, setOriginalSignal] = useState(0);
  const [isAllTranslated, setIsAllTranslated] = useState(false);

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

  const { messages: apiMessages, isLoading: messagesLoading, isSending, isBanned, send, refetch } = useLiveChatMessages(selectedRoomId);

  // Fetch full room details (description, moderators, messageCount) for the selected room
  const { room: roomDetails } = useLiveChatRoomDetails(selectedRoomId);

  // Online presence
  const { onlineCount } = useLiveChatPresence(selectedRoomId);

  // Determine if current user is a moderator for this room
  const isModerator = useMemo(() => {
    if (!walletAddress || !roomDetails?.moderators) return false;
    return roomDetails.moderators.some(
      (mod: string) => mod.toLowerCase() === walletAddress.toLowerCase()
    );
  }, [walletAddress, roomDetails]);

  // Convert API messages to local format
  const messages: Message[] = apiMessages.map(toLocalMessage);

  // Filter messages based on search query
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      m => m.content.toLowerCase().includes(q) || m.userName.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  // Find pinned message
  const pinnedMessage = messages.find(m => m.isPinned);

  // Toggle search
  const handleToggleSearch = useCallback(() => {
    setIsSearchOpen(prev => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        setSearchQuery('');
      }
      return !prev;
    });
  }, []);

  const handleTranslateAll = useCallback(() => {
    if (isAllTranslated) {
      setOriginalSignal(s => s + 1);
      setIsAllTranslated(false);
    } else {
      setTranslateSignal(s => s + 1);
      setIsAllTranslated(true);
    }
  }, [isAllTranslated]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  const handleSendMessage = async (args: { content: string; type: string }) => {
    if (!isAuthenticated) {
      toast.error('Sign in to send messages');
      return;
    }
    const type = args.type === 'media' ? 'image' : args.type === 'msg' ? 'text' : args.type as 'text' | 'image' | 'gif';
    try {
      await send(args.content, type);
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
  const roomName = t('publicChat.title');
  const roomDescription = t('publicChat.allThingsDeHub');

  const handleRoomCreated = useCallback((room: LiveChatRoom) => {
    refetchRooms();
    setSelectedRoomId(room.id);
  }, [refetchRooms]);

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl overflow-hidden overflow-x-hidden">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-zinc-500 text-xs truncate max-w-[180px]">
                    {roomDescription}
                  </p>
                </TooltipTrigger>
                <TooltipContent>{roomDescription}</TooltipContent>
              </Tooltip>
            ) : rooms.length > 0 ? (
              <span className="text-zinc-500 text-xs flex items-center gap-1">
                <Users className="w-3 h-3" />
                {onlineCount} online
              </span>
            ) : null}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Translate all toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isAllTranslated ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:text-white'}`}
                onClick={handleTranslateAll}
              >
                {isAllTranslated ? <RotateCcw className="w-4 h-4" /> : <Languages className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isAllTranslated ? 'Show original' : 'Translate all'}</TooltipContent>
          </Tooltip>
          {/* Search toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isSearchOpen ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:text-white'}`}
                onClick={handleToggleSearch}
              >
                <Search className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('publicChat.searchMessages')}</TooltipContent>
          </Tooltip>
          {isModerator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white"
                  onClick={() => setCreateRoomOpen(true)}
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create new room</TooltipContent>
            </Tooltip>
          )}
          {isModerator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Room settings</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Search bar */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('publicChat.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {searchQuery && (
            <span className="text-xs text-zinc-400 flex-shrink-0">
              {t('publicChat.resultsCount', { count: filteredMessages.length })}
            </span>
          )}
          <button
            onClick={handleToggleSearch}
            className="text-zinc-500 hover:text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned message banner */}
      {pinnedMessage && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-sm">
          <Pin className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <span className="text-yellow-200/80 font-medium text-xs truncate">
            {pinnedMessage.userName}: {pinnedMessage.content}
          </span>
          {isModerator && (
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
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => setTranslateSignal(s => s + 1), requestOriginal: () => setOriginalSignal(s => s + 1) }}>
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
                variant="glass"
                size="sm"
                onClick={() => refetchRooms()}
                className="mt-2"
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
          ) : filteredMessages.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <Search className="w-12 h-12 text-zinc-700" />
              <p className="text-sm">{t('publicChat.noResults')}</p>
            </div>
          ) : (
            filteredMessages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
                showActions={isModerator}
                moderators={roomDetails?.moderators}
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
      </SharedTranslationContext.Provider>
      
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
