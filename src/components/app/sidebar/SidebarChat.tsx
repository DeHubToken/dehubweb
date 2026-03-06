import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Users, Loader2, Mic } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { TranslatableText, replaceLinksWithEmoji, SharedTranslationContext } from '../TranslatableText';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { VoiceRecorder } from '../chat/VoiceRecorder';
import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatPresence } from '@/hooks/use-livechat';
import { getMediaUrl, getAuthToken } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

/** Sidebar chat badge — livechat messages have no badge data, removed edge function call */
function SidebarChatBadge({ address: _address }: { address: string }) {
  return null;
}

export function SidebarChat() {
  const [newMessage, setNewMessage] = useState('');
  const translateSignal = 0;
  const originalSignal = 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText.slice(0, 169)),
  });

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

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) {
      toast.error('Sign in to send voice notes');
      return;
    }
    const toastId = 'sidebarchat-voice-upload';
    toast.loading('Uploading voice note...', { id: toastId });
    try {
      const token = getAuthToken();
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', file, file.name);
      const { data, error } = await supabase.functions.invoke('dm-upload-media', {
        body: formData,
        headers: {
          'x-wallet-address': walletAddress?.toLowerCase() || '',
          'x-dehub-token': token || '',
        },
      });
      if (error || !data?.ok || !data?.url) {
        throw new Error(data?.error || error?.message || 'Upload failed');
      }
      await send('', 'voice', data.url);
      toast.success('Voice note sent!', { id: toastId });
    } catch (err: any) {
      console.error('[SidebarChat] Voice upload failed:', err);
      toast.error(err?.message || 'Failed to send voice note', { id: toastId });
    }
  }, [isAuthenticated, walletAddress, send]);

  const handleSend = async () => {
    toast('Live chat only available in-app currently, download now on Google Play. Coming soon to iOS.', {
      description: (
        <button
          onClick={() => window.open('https://play.google.com/store/apps/details?id=io.dehub.mobile&hl', '_blank')}
          className="mt-2 w-full py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
          Download on Google Play
        </button>
      ),
    });
    return;
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleGifSelect = async (gifUrl: string) => {
    toast('Live chat only available in-app currently, download now on Google Play. Coming soon to iOS.', {
      description: (
        <button
          onClick={() => window.open('https://play.google.com/store/apps/details?id=io.dehub.mobile&hl', '_blank')}
          className="mt-2 w-full py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 0 1 0 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
          Download on Google Play
        </button>
      ),
    });
    return;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.isOpen) {
      const handled = mention.handleKeyDown(e);
      if (handled) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const liveResults = (window as any).__mentionResults || [];
          if (liveResults[mention.selectedIndex]) {
            mention.handleSelect(liveResults[mention.selectedIndex]);
          }
        }
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = roomsLoading || messagesLoading;

  return (
    <div className="flex flex-col h-full pl-px">

      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
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
                <div key={msg.id} className="flex items-start gap-2" style={{ paddingLeft: '10px' }}>
                  <button onClick={goToProfile} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                    <Avatar className="w-6 h-6">
                      {avatarUrl && <AvatarImage src={avatarUrl} />}
                      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
                        {name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="relative inline-flex items-baseline gap-1.5">
                      <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>{name}</button>
                      <SidebarChatBadge address={msg.sender_address} />
                      <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                    </span>
                    {msg.message_type === 'image' && msg.image_url ? (
                      <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5" />
                    ) : msg.message_type === 'gif' && msg.image_url ? (
                      <img src={msg.image_url} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                    ) : msg.message_type === 'voice' && msg.image_url ? (
                      <div className="mt-1 flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 max-w-[200px]">
                        <Mic className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <audio controls preload="none" className="h-8 w-full [&::-webkit-media-controls-panel]:bg-transparent">
                          <source src={msg.image_url} type="audio/webm" />
                        </audio>
                      </div>
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
      </SharedTranslationContext.Provider>

      {/* Input */}
      <div className="p-3">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length <= 169) {
                const processed = replaceLinksWithEmoji(val);
                setNewMessage(processed);
                mention.handleInput(processed, e.target.selectionStart);
              }
            }}
            onKeyDown={handleKeyDown}
            maxLength={169}
            className="min-h-[44px] resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-24 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
            rows={1}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <UserMentionDropdown
            query={mention.query}
            isOpen={mention.isOpen}
            position={mention.position}
            selectedIndex={mention.selectedIndex}
            onSelectedIndexChange={mention.setSelectedIndex}
            onSelect={mention.handleSelect}
            onClose={mention.handleClose}
          />
          <div className="absolute bottom-0 right-0 flex items-center gap-0.5">
            <EmojiGifPicker
              onEmojiSelect={handleEmojiSelect}
              onGifSelect={handleGifSelect}
            />
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={false}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
