/**
 * Live Post Chat Component
 * ========================
 * Displays a live chat feed below the stream on the single post page.
 * Uses the livechat_messages table with realtime subscriptions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Loader2, Users, Mic, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLiveChatMessages, useLiveChatPresence } from '@/hooks/use-livechat';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl, getAuthToken } from '@/lib/api/dehub';
import { supabase } from '@/integrations/supabase/client';
import { VoiceRecorder } from '@/components/app/chat/VoiceRecorder';
import { useBatchedBadgeBalance } from '@/contexts/BadgeBalanceContext';
import { getBadgeUrl } from '@/lib/staking-badges';
import { toast } from 'sonner';
import { format } from 'date-fns';

function LiveChatBadge({ address }: { address: string }) {
  const { badgeBalance } = useBatchedBadgeBalance(address);
  const badgeUrl = getBadgeUrl(badgeBalance);
  if (!badgeUrl) return null;
  return <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />;
}

interface LivePostChatProps {
  streamId: string;
  isOffline?: boolean;
}

export function LivePostChat({ streamId, isOffline = false }: LivePostChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; duration: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, walletAddress } = useAuth();

  // Use stream ID as the room ID for live chat
  const { messages, isLoading, isSending, send } = useLiveChatMessages(streamId);
  const { onlineCount } = useLiveChatPresence(streamId);

  // Auto-scroll on new messages
  useEffect(() => {
    if (bottomRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
  }, [messages.length]);

  const handleVoiceRecordingComplete = useCallback((blob: Blob, duration: number) => {
    setAudioPreview({ blob, duration });
    toast.success(`Recording saved (${duration}s)`);
  }, []);

  const handleSend = async () => {
    // Handle audio message
    if (audioPreview) {
      if (!isAuthenticated || !walletAddress) { toast.error('Sign in to chat'); return; }
      try {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', audioPreview.blob, `voice-${Date.now()}.webm`);

        const { data, error } = await supabase.functions.invoke('dm-upload-media', {
          body: formData,
          headers: {
            'x-wallet-address': walletAddress.toLowerCase(),
            'x-dehub-token': token || '',
          },
        });

        if (error || !data?.ok) throw new Error(data?.error || 'Upload failed');

        await send(`🎤 Voice message (${audioPreview.duration}s)`, 'voice', data.url);
        setAudioPreview(null);
      } catch (err) {
        console.error('[LivePostChat] Voice upload error:', err);
        toast.error('Failed to send voice note');
      }
      return;
    }

    if (!newMessage.trim()) return;
    if (!isAuthenticated) {
      toast.error('Sign in to chat');
      return;
    }
    try {
      await send(newMessage.trim());
      setNewMessage('');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-transparent p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-white text-sm">Live Chat</h3>
          {isOffline && (
            <span className="text-xs text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-800">Offline</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{onlineCount}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto space-y-1 mb-3 scrollbar-hide">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-zinc-500 text-sm">
              {isOffline ? 'Chat is no longer active' : 'No messages yet. Be the first!'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const avatarUrl = msg.sender_avatar_url
              ? buildAvatarUrl(msg.sender_address, msg.sender_avatar_url)
              : undefined;
            const displayName = msg.sender_display_name || msg.sender_username || msg.sender_address.slice(0, 8);

            return (
              <div key={msg.id} className="group py-1.5 px-1">
                <div className="flex items-start gap-2">
                  <Avatar className="w-6 h-6 rounded-md flex-shrink-0 mt-0.5">
                    {avatarUrl && <AvatarImage src={avatarUrl} className="rounded-md" />}
                    <AvatarFallback className="bg-zinc-700 text-white text-[10px] rounded-md">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="relative inline-flex items-baseline">
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                          {displayName}
                        </span>
                        <LiveChatBadge address={msg.sender_address} />
                      </span>
                    </div>
                    {msg.message_type === 'voice' && msg.image_url ? (
                      <div className="mt-1 flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 max-w-[200px]">
                        <Mic className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <audio controls preload="none" className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent">
                          <source src={msg.image_url} type="audio/webm" />
                        </audio>
                      </div>
                    ) : msg.message_type === 'image' && msg.image_url ? (
                      <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5" />
                    ) : msg.message_type === 'gif' && msg.image_url ? (
                      <img src={msg.image_url} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                    ) : (
                      <p className="text-sm text-zinc-300 break-words">{msg.content}</p>
                    )}
                    <span className="text-[10px] text-zinc-600 mt-0.5 block">
                      {format(new Date(msg.created_at), 'HH:mm')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-2">
        {audioPreview && (
          <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-white">🎤 {audioPreview.duration}s</span>
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
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOffline ? 'Chat is offline' : 'Type a message...'}
            disabled={isOffline || !isAuthenticated}
            className="min-h-[56px] max-h-32 resize-none bg-white/5 border-white/10 text-white placeholder:text-zinc-500 text-sm rounded-xl pr-24"
            rows={2}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={isOffline || !isAuthenticated}
            />
            <button
              onClick={handleSend}
              disabled={isSending || (!newMessage.trim() && !audioPreview) || isOffline}
              className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
