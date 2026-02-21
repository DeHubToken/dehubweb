import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Smile, Users, Loader2, Mic, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TranslatableText } from '../TranslatableText';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatPresence } from '@/hooks/use-livechat';
import { getMediaUrl } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useBatchedBadgeBalance } from '@/contexts/BadgeBalanceContext';
import { getBadgeUrl } from '@/lib/staking-badges';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

function SidebarChatBadge({ address }: { address: string }) {
  const { badgeBalance } = useBatchedBadgeBalance(address);
  const badgeUrl = getBadgeUrl(badgeBalance);
  if (!badgeUrl) return null;
  return <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />;
}

export function SidebarChat() {
  const [newMessage, setNewMessage] = useState('');
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; duration: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Use the first available room
  const { rooms, isLoading: roomsLoading } = useLiveChatRooms();
  const roomId = rooms[0]?.id || null;
  const { messages, isLoading: messagesLoading, isSending, send } = useLiveChatMessages(roomId);
  const { onlineCount } = useLiveChatPresence(roomId);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
    }
  }, [messages.length]);

  const handleVoiceRecordingComplete = useCallback((blob: Blob, duration: number) => {
    setAudioPreview({ blob, duration });
    toast.success(`Recording saved (${duration}s)`);
  }, []);

  const handleSend = async () => {
    // Handle audio message - send as text since livechat doesn't support audio type
    if (audioPreview) {
      if (!isAuthenticated) { toast.error('Sign in to chat'); return; }
      try {
        await send(`🎤 Voice message (${audioPreview.duration}s)`, 'text');
        setAudioPreview(null);
      } catch { toast.error('Failed to send'); }
      return;
    }

    if (!newMessage.trim()) return;
    if (!isAuthenticated) {
      toast.error('Sign in to chat');
      return;
    }
    const text = newMessage.trim();
    setNewMessage('');
    try {
      await send(text, 'text');
    } catch {
      toast.error('Failed to send');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = roomsLoading || messagesLoading;

  return (
    <div className="flex flex-col h-full px-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3">
        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
        <span className="text-zinc-400 text-xs flex items-center gap-1">
          <Users className="w-3 h-3" /> {onlineCount} online
        </span>
      </div>

      {/* Messages */}
      <div className="relative flex-1">
        <div className="absolute inset-0 overflow-y-auto py-2 space-y-2">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Skeleton className="w-6 h-6 rounded-md bg-white/[0.06]" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-3 w-16 bg-white/[0.06]" />
                    <Skeleton className="h-3 w-32 bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center mb-2">
                <Users className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-zinc-500 text-xs">No messages yet</p>
              <p className="text-zinc-600 text-xs">Be the first to say hello!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const avatarUrl = buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url);
              const name = msg.sender_display_name || msg.sender_username || msg.sender_address?.slice(0, 8) || 'Anon';
              const handle = msg.sender_username;
              const goToProfile = handle ? () => navigate(`/${handle}`) : undefined;
              return (
                <div key={msg.id} className="flex items-start gap-2">
                  <button onClick={goToProfile} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                    <Avatar className="w-6 h-6">
                      {avatarUrl && <AvatarImage src={avatarUrl} />}
                      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
                        {name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="min-w-0">
                    <span className="relative inline-flex items-baseline">
                      <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>{name}</button>
                      <SidebarChatBadge address={msg.sender_address} />
                    </span>
                    {msg.message_type === 'image' && msg.image_url ? (
                      <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5" />
                    ) : msg.message_type === 'gif' && msg.image_url ? (
                      <img src={msg.image_url} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                    ) : (
                      <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="pt-2">
        {/* Audio Preview */}
        {audioPreview && (
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-white">
              🎤 {audioPreview.duration}s
            </span>
            <button
              onClick={() => setAudioPreview(null)}
              className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          </div>
        )}
        <div className="relative">
          <Textarea
            placeholder="Send a message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[56px] max-h-32 resize-none text-sm bg-zinc-800 border-zinc-700 rounded-lg pr-24 text-white placeholder:text-zinc-500"
            rows={2}
          />
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <Smile className="w-4 h-4 text-zinc-500" />
            </Button>
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={false}
            />
            <button
              onClick={handleSend}
              disabled={(!newMessage.trim() && !audioPreview) || isSending}
              className="h-7 w-7 flex items-center justify-center disabled:opacity-40"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
