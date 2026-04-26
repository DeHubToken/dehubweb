import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Send, Users, Loader2, Mic, SmilePlus, Reply, CornerDownRight, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { TranslatableText, replaceLinksWithEmoji, SharedTranslationContext } from '../TranslatableText';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatPresence, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { getMediaUrl, getAuthToken } from '@/lib/api/dehub';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { toast } from 'sonner';
import type { ReactionData } from '../chat/ChatMessage';
import { useBuyAlerts, type BuyAlertMessage } from '@/hooks/use-buy-alerts';
import { BuyAlertCard } from '../chat/BuyAlertCard';
import { useBuyBotHidden } from '@/hooks/use-buy-bot-hidden';
import { useAssistantReplies, useAssistantReplyEngine, type AssistantReply } from '@/hooks/use-assistant-replies';
import { Sparkles } from 'lucide-react';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/** Avatar with cascading fallback: primary → CDN → initials */
function SidebarAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-6 h-6">
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Sidebar chat badge */
function SidebarChatBadge({ badgeBalance, username }: { badgeBalance?: number | null; username?: string | null }) {
  return <BadgeIcon badgeBalance={badgeBalance} username={username} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />;
}

/** Compact reaction pills for sidebar */
function SidebarReactions({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
}: {
  reactions: ReactionData;
  currentUserAddress?: string;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  messageId: string;
}) {
  const entries = Object.entries(reactions).filter(([, addrs]) => addrs.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {entries.map(([emoji, addresses]) => {
        const mine = currentUserAddress
          ? addresses.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase())
          : false;
        return (
          <button
            key={emoji}
            onClick={() => mine ? onRemoveReaction(messageId, emoji) : onReact(messageId, emoji)}
            className={`group/reaction inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded-md border transition-colors ${
              mine
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <span className="text-xs">{emoji}</span>
            {mine ? (
              <>
                <span className="group-hover/reaction:hidden">{addresses.length}</span>
                <X className="w-2.5 h-2.5 hidden group-hover/reaction:block text-white" />
              </>
            ) : (
              <span>{addresses.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SidebarChat() {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<SupabaseLiveChatMessage | null>(null);
  const translateSignal = 0;
  const originalSignal = 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText.slice(0, 169)),
  });

  const { rooms, isLoading: roomsLoading } = useLiveChatRooms();
  const roomId = rooms[0]?.id || null;
  const { messages, isLoading: messagesLoading, isSending, send, addReaction, removeReaction } = useLiveChatMessages(roomId);
  const { onlineCount } = useLiveChatPresence(roomId);

  // Buy alerts
  const buyAlerts = useBuyAlerts();
  const { isHidden: buyBotHidden, hide: hideBuyBot } = useBuyBotHidden();

  // Local-only @assistant replies (shared singleton — same as PublicChat)
  useAssistantReplyEngine(messages);
  const assistantReplies = useAssistantReplies();

  // Merge livechat messages + buy alerts + assistant replies
  type MergedItem =
    | { type: 'message'; data: typeof messages[0] }
    | { type: 'buy_alert'; data: BuyAlertMessage }
    | { type: 'assistant'; data: AssistantReply };
  const mergedItems: MergedItem[] = (() => {
    const items: MergedItem[] = [
      ...messages.map((m) => ({ type: 'message' as const, data: m })),
      ...buyAlerts.map((a) => ({ type: 'buy_alert' as const, data: a })),
      ...assistantReplies.map((a) => ({ type: 'assistant' as const, data: a })),
    ];
    const tsOf = (it: MergedItem) =>
      it.type === 'assistant' ? it.data.timestamp.getTime() : new Date(it.data.created_at).getTime();
    items.sort((a, b) => tsOf(a) - tsOf(b));
    return items;
  })();

  // Scroll to bottom (jump, not animated). For initial load we retry a few times
  // because async content (avatars, link previews, GIFs) keeps growing scrollHeight
  // after the initial paint.
  const scrollToBottom = useCallback((retry = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (retry) {
      // Retry after async images/link previews settle.
      [50, 150, 350, 800].forEach((ms) => {
        setTimeout(() => {
          const node = scrollContainerRef.current;
          if (node) node.scrollTop = node.scrollHeight;
        }, ms);
      });
    }
  }, []);

  // First time messages become available — jump to bottom synchronously before paint
  // so the user never sees a "starts at top then jumps" flash.
  const didInitialScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return;
    if (mergedItems.length === 0) return;
    didInitialScrollRef.current = true;
    scrollToBottom(true);
  }, [mergedItems.length, scrollToBottom]);

  // When subsequent new messages arrive, smooth-scroll to bottom.
  useEffect(() => {
    if (!didInitialScrollRef.current) return;
    if (mergedItems.length > 0) {
      scrollToBottom();
    }
  }, [mergedItems.length, scrollToBottom]);


  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) { openLoginModal(); return; }
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
      if (error || !data?.ok || !data?.url) throw new Error(data?.error || error?.message || 'Upload failed');
      await send('', 'voice', data.url);
      toast.success('Voice note sent!', { id: toastId });
    } catch (err: any) {
      console.error('[SidebarChat] Voice upload failed:', err);
      toast.error(err?.message || 'Failed to send voice note', { id: toastId });
    }
  }, [isAuthenticated, walletAddress, send]);

  const handleSend = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const trimmed = newMessage.trim();
    if (!trimmed || !roomId) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      await send(trimmed, 'text', undefined, replyToId);
      setNewMessage('');
    } catch (err) {
      console.error('[SidebarChat] Send failed:', err);
      toast.error('Failed to send message');
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      await send(gifUrl, 'gif', undefined, replyToId);
    } catch (err) {
      console.error('[SidebarChat] GIF send failed:', err);
      toast.error('Failed to send GIF');
    }
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

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    // Toggle: remove if already reacted
    const msg = messages.find((m) => m.id === messageId);
    const myReaction = walletAddress && msg?.reactions?.[emoji]?.some(
      (a) => a.toLowerCase() === walletAddress.toLowerCase()
    );
    if (myReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  }, [isAuthenticated, walletAddress, messages, addReaction, removeReaction]);

  const isLoading = roomsLoading || messagesLoading;

  return (
    <div className="flex flex-col h-full pl-px">
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
      <div className="relative flex-1">
        <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto py-2 space-y-2">
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
          ) : mergedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center mb-2">
                <Users className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-zinc-500 text-xs">No messages yet</p>
              <p className="text-zinc-600 text-xs">Be the first to say hello!</p>
            </div>
          ) : (
            mergedItems.map((item) => {
              if (item.type === 'buy_alert') {
                if (buyBotHidden) return null;
                return (
                  <BuyAlertCard
                    key={`buy-alert-${item.data.id}`}
                    content={item.data.content}
                    timestamp={item.data.created_at}
                    onHide={hideBuyBot}
                  />
                );
              }
              if (item.type === 'assistant') {
                const r = item.data;
                return (
                  <div
                    key={`assistant-${r.id}`}
                    className="group relative"
                    style={{ paddingLeft: '10px', paddingRight: '10px' }}
                  >
                    <div className="flex items-start gap-2">
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={assistantAvatar} alt="assistant" />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          <Sparkles className="w-3 h-3" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        {r.replyToName && (
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mb-0.5">
                            <CornerDownRight className="w-2.5 h-2.5" />
                            <span className="font-medium">{r.replyToName}</span>
                          </div>
                        )}
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-white">assistant</span>
                          <span className="text-[8px] uppercase tracking-wide px-1 py-px rounded bg-primary/20 text-primary border border-primary/30">
                            AI
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(r.timestamp.toISOString())}</span>
                        </span>
                        <p className="text-xs text-zinc-300 break-words whitespace-pre-wrap">{r.content}</p>
                      </div>
                    </div>
                  </div>
                );
              }
              const msg = item.data;
              const avatarUrl = buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url);
              const name = msg.sender_display_name || msg.sender_username || msg.sender_address?.slice(0, 8) || 'Anon';
              const handle = msg.sender_username;
              const goToProfile = handle ? () => navigate(`/${handle}`) : undefined;
              return (
                <div key={msg.id} data-message-id={msg.id} className="group relative transition-colors duration-500" style={{ paddingLeft: '10px', paddingRight: '10px' }}>
                  {/* Reply indicator – click to scroll to original */}
                  {msg.reply_to && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = scrollContainerRef.current?.querySelector(`[data-message-id="${msg.reply_to!.id}"]`);
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          (target as HTMLElement).classList.add('bg-white/10');
                          setTimeout(() => (target as HTMLElement).classList.remove('bg-white/10'), 1500);
                        }
                      }}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 ml-8 mb-0.5 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <CornerDownRight className="w-2.5 h-2.5" />
                      <span className="font-medium">{msg.reply_to.sender_name}</span>
                      <span className="truncate max-w-[120px]">{msg.reply_to.content}</span>
                    </button>
                  )}
                  <div className="flex items-start gap-2">
                    <button onClick={goToProfile} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                      <SidebarAvatar src={avatarUrl} address={msg.sender_address} name={name} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
                          <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white truncate ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>{name}</button>
                          <SidebarChatBadge badgeBalance={msg.sender_badge_balance} username={msg.sender_username} />
                        </span>
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
                      {/* Reactions */}
                      {msg.reactions && (
                        <SidebarReactions
                          reactions={msg.reactions}
                          currentUserAddress={walletAddress || undefined}
                          onReact={addReaction}
                          onRemoveReaction={removeReaction}
                          messageId={msg.id}
                        />
                      )}
                    </div>
                    {/* Hover action buttons */}
                    {isAuthenticated && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setReplyTo(msg)}
                              className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                            >
                              <Reply className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Reply</TooltipContent>
                        </Tooltip>
                        <Popover>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <PopoverTrigger asChild>
                                <button className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded">
                                  <SmilePlus className="w-3 h-3" />
                                </button>
                              </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">React</TooltipContent>
                          </Tooltip>
                          <PopoverContent
                            side="top"
                            align="end"
                            className="w-auto p-1 bg-zinc-800 border-zinc-700 rounded-xl"
                          >
                            <div className="flex gap-0.5">
                              {QUICK_EMOJIS.map((emoji) => {
                                const isActive = walletAddress && msg.reactions?.[emoji]?.some(
                                  (a) => a.toLowerCase() === walletAddress.toLowerCase()
                                );
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReact(msg.id, emoji)}
                                    className={`w-7 h-7 flex items-center justify-center text-sm rounded-lg transition-colors ${
                                      isActive ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-zinc-700'
                                    }`}
                                  >
                                    {emoji}
                                  </button>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
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

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-1.5 mx-3 mb-1 px-2 py-1 bg-zinc-800/70 rounded-lg border-l-2 border-white/30">
          <Reply className="w-3 h-3 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-white">
              {replyTo.sender_display_name || replyTo.sender_username || 'User'}
            </span>
            <p className="text-[10px] text-zinc-400 truncate">{replyTo.content || 'Media'}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="pl-3 pr-[14px] py-3">
        <div>
          <Textarea
            ref={textareaRef}
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length <= 500) {
                setNewMessage(val);
                mention.handleInput(val, e.target.selectionStart);
              }
              // Auto-resize — deferred to avoid forced synchronous reflow
              const ta = e.target;
              requestAnimationFrame(() => {
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
              });
            }}
            onKeyDown={handleKeyDown}
            maxLength={169}
            className="min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
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
          <div className="flex items-center justify-end gap-0.5 pt-1">
            <EmojiGifPicker
              onEmojiSelect={handleEmojiSelect}
              onGifSelect={handleGifSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
