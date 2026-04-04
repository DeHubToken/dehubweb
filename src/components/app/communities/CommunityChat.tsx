/**
 * Community Chat
 * ===============
 * Full chat UI for community members. Matches SidebarChat style exactly.
 * Supports text, emoji, GIF, replies, and reactions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Users, Loader2, SmilePlus, Reply, CornerDownRight, X, MessageSquare, LogIn } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useCommunityChat, type CommunityChatMessage } from '@/hooks/use-community-chat';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { replaceLinksWithEmoji, TranslatableText, SharedTranslationContext } from '../TranslatableText';
import { useProfile } from '@/hooks/use-profile';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/** Avatar with cascading fallback */
function ChatAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-7 h-7">
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

/** Reaction pills */
function ChatReactions({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
}: {
  reactions: Record<string, string[]>;
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

interface CommunityChatProps {
  communityId: string;
  isMember: boolean;
}

export function CommunityChat({ communityId, isMember }: CommunityChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { data: profile } = useProfile(walletAddress);

  const { messages, isLoading, sendMessage, addReaction, removeReaction } = useCommunityChat(communityId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && bottomRef.current) {
      const scrollContainer = bottomRef.current.closest('.overflow-y-auto');
      if (scrollContainer) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
      }
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    setNewMessage('');
    try {
      await sendMessage(trimmed, 'text', undefined, replyToId, {
        username: profile?.username || undefined,
        displayName: profile?.displayName || undefined,
        avatarUrl: profile?.avatarImageUrl || undefined,
      });
    } catch {
      // Error handled in hook
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => (prev + emoji).slice(0, 500));
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      await sendMessage(gifUrl, 'gif', gifUrl, replyToId, {
        username: profile?.username || undefined,
        displayName: profile?.displayName || undefined,
        avatarUrl: profile?.avatarImageUrl || undefined,
      });
    } catch {
      // Error handled in hook
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const msg = messages.find(m => m.id === messageId);
    const myReaction = walletAddress && msg?.reactions?.[emoji]?.some(
      (a) => a.toLowerCase() === walletAddress.toLowerCase()
    );
    if (myReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  }, [isAuthenticated, walletAddress, messages, addReaction, removeReaction]);

  const translateSignal = 0;
  const originalSignal = 0;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 340px)', minHeight: '300px' }}>
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
        {/* Messages area */}
        <div className="relative flex-1">
          <div className="absolute inset-0 overflow-y-auto py-2 space-y-2">
            {isLoading ? (
              <div className="space-y-3 py-2 px-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/[0.06]" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3 w-20 bg-white/[0.06]" />
                      <Skeleton className="h-3 w-40 bg-white/[0.06]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-zinc-500" />
                </div>
                <p className="text-zinc-500 text-sm">No messages yet</p>
                <p className="text-zinc-600 text-xs mt-1">Be the first to say something!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const avatarUrl = buildAvatarUrl(msg.wallet_address, msg.avatar_url);
                const name = msg.display_name || msg.username || msg.wallet_address?.slice(0, 8) || 'Anon';
                const handle = msg.username;
                const goToProfile = handle ? () => navigate(`/${handle}`) : undefined;

                return (
                  <div key={msg.id} className="group relative px-3">
                    {/* Reply indicator */}
                    {msg.reply_to && (
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 ml-9 mb-0.5">
                        <CornerDownRight className="w-2.5 h-2.5" />
                        <span className="font-medium">{msg.reply_to.sender_name}</span>
                        <span className="truncate max-w-[200px]">{msg.reply_to.content}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <button onClick={goToProfile} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                        <ChatAvatar src={avatarUrl} address={msg.wallet_address} name={name} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="relative inline-flex items-baseline gap-1.5">
                          <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                            {name}
                          </button>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                        </span>
                        {msg.message_type === 'gif' && msg.image_url ? (
                          <img src={msg.image_url} alt="GIF" className="max-w-[280px] max-h-32 rounded mt-0.5" loading="lazy" />
                        ) : (
                          <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
                        )}
                        {/* Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <ChatReactions
                            reactions={msg.reactions}
                            currentUserAddress={walletAddress || undefined}
                            onReact={addReaction}
                            onRemoveReaction={removeReaction}
                            messageId={msg.id}
                          />
                        )}
                      </div>
                      {/* Hover action buttons */}
                      {isAuthenticated && isMember && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setReplyTo(msg)}
                                className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Reply</TooltipContent>
                          </Tooltip>
                          <Popover>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                  <button className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded">
                                    <SmilePlus className="w-3.5 h-3.5" />
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
                                      className={`w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors ${
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
        <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 bg-zinc-800/70 rounded-lg border-l-2 border-white/30">
          <Reply className="w-3.5 h-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-white">
              {replyTo.display_name || replyTo.username || 'User'}
            </span>
            <p className="text-[10px] text-zinc-400 truncate">{replyTo.content || 'Media'}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      {isMember ? (
        <div className="px-1 py-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= 500) {
                  const processed = replaceLinksWithEmoji(val);
                  setNewMessage(processed);
                }
                const ta = e.target;
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
              }}
              onKeyDown={handleKeyDown}
              maxLength={500}
              className="min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
              rows={1}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-0.5">
                <EmojiGifPicker
                  onEmojiSelect={handleEmojiSelect}
                  onGifSelect={handleGifSelect}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-600">{newMessage.length}/500</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-1 py-3">
          <button
            onClick={() => !isAuthenticated ? openLoginModal() : null}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 text-sm hover:text-white transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Join this community to chat
          </button>
        </div>
      )}
    </div>
  );
}
