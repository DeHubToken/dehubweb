/**
 * TV Chat
 * =======
 * Live chat under a playing TV channel. One room per channel.
 *
 * Message rendering is the community/live chat row verbatim — same name
 * fallback chain, same BadgeIcon placement, same formatTimeAgo readout, same
 * single-level reply header and reaction pills — so a message looks identical
 * wherever it is read.
 *
 * @module components/app/tv/TVChat
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, SmilePlus, Reply, CornerDownRight, X, MessageSquare, LogIn, Pencil, Check, Trash2, ArrowDown } from 'lucide-react';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useTVChat, type TVChatMessage } from '@/hooks/use-tv-chat';
import { useNavigate } from 'react-router-dom';
import { TranslatableText, SharedTranslationProvider } from '../TranslatableText';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/** Avatar with cascading fallback: primary → CDN → initials */
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

interface TVChatProps {
  channelId: string;
  channelName?: string;
  /**
   * Subscribe only while the channel is actually on screen and playing.
   * /app/tv mounts up to 50 cards at once and never unmounts the page, so an
   * ungated panel would hold 50 realtime channels open for the whole session.
   */
  enabled?: boolean;
}

export function TVChat({ channelId, channelName, enabled = true }: TVChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<TVChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const navigate = useNavigate();
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
  } = useTVChat(channelId, enabled);

  // Track whether the reader is pinned to the bottom; only auto-scroll if so,
  // otherwise a busy channel yanks the view while they are reading back.
  const atBottomRef = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    });
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = newMessage.trim();
    if (!text || isSending) return;
    if (!isAuthenticated || !walletAddress) {
      openLoginModal?.();
      return;
    }
    setIsSending(true);
    try {
      await sendMessage(text, 'text', undefined, replyTo?.id, {
        username: user?.username || undefined,
        displayName: user?.displayName || undefined,
        avatarUrl: user?.avatarImageUrl || undefined,
        badgeBalance: user?.badgeBalance ?? undefined,
      });
      setNewMessage('');
      setReplyTo(null);
      atBottomRef.current = true;
      scrollToBottom();
    } catch {
      // toast already raised in the hook
    } finally {
      setIsSending(false);
    }
  }, [newMessage, isSending, isAuthenticated, walletAddress, openLoginModal, sendMessage, replyTo, user, scrollToBottom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleReact = (id: string, emoji: string) => {
    if (!walletAddress) {
      openLoginModal?.();
      return;
    }
    const msg = messages.find(m => m.id === id);
    const mine = msg?.reactions?.[emoji]?.some(a => a.toLowerCase() === walletAddress.toLowerCase());
    if (mine) removeReaction(id, emoji);
    else addReaction(id, emoji);
  };

  return (
    <div
      className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3"
      // Playback controls sit right above this; a click in the chat must not
      // reach the card's play/pause handler.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-semibold text-white">Live chat</span>
        {channelName && (
          <span className="text-[10px] text-zinc-500 truncate">· {channelName}</span>
        )}
      </div>

      <SharedTranslationProvider>
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-56 overflow-y-auto space-y-1 scrollbar-hide"
          >
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
                <MessageSquare className="w-5 h-5 text-zinc-700" />
                <p className="text-[11px] text-zinc-500">No messages yet — say something.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const avatarUrl = buildAvatarUrl(msg.wallet_address, msg.avatar_url);
                const name = msg.display_name || msg.username || msg.wallet_address?.slice(0, 8) || 'Anon';
                const handle = msg.username;
                const goToProfile = handle ? () => navigate(`/${handle}`) : undefined;
                const isMine = !!walletAddress && msg.wallet_address.toLowerCase() === walletAddress.toLowerCase();

                return (
                  <div key={msg.id} className="group relative">
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
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
                            <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white truncate ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                              {name}
                            </button>
                            <BadgeIcon badgeBalance={msg.badge_balance} username={msg.username} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                        </span>
                        {editingId === msg.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  editMessage(msg.id, editText);
                                  setEditingId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="flex-1 text-xs text-white bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-white/20"
                              maxLength={500}
                            />
                            <button
                              onClick={() => { editMessage(msg.id, editText); setEditingId(null); }}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-0.5 text-zinc-500 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
                        )}
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
                      {isAuthenticated && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                          {isMine && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { setEditingId(msg.id); setEditText(msg.content); }}
                                  className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Edit</TooltipContent>
                            </Tooltip>
                          )}
                          {isMine && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { if (confirm('Delete this message?')) deleteMessage(msg.id); }}
                                  className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Delete</TooltipContent>
                            </Tooltip>
                          )}
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

          {showJumpToLatest && (
            <button
              onClick={() => { atBottomRef.current = true; scrollToBottom(); }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium shadow-lg border border-white/10 transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Jump to latest
            </button>
          )}
        </div>
      </SharedTranslationProvider>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-zinc-800/70 rounded-lg border-l-2 border-white/30">
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

      {/* Composer */}
      {isAuthenticated ? (
        <div className="pt-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <div className="relative">
              <span className="absolute top-1 right-0 text-[10px] text-zinc-600 z-10">{newMessage.length}/500</span>
              <Textarea
                ref={textareaRef}
                placeholder="Type here..."
                value={newMessage}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= 500) setNewMessage(val);
                  const ta = e.target;
                  requestAnimationFrame(() => {
                    ta.style.height = 'auto';
                    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
                  });
                }}
                onKeyDown={handleKeyDown}
                maxLength={500}
                className="min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
                rows={1}
              />
            </div>
            <div className="flex items-center justify-end pt-1">
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!newMessage.trim() || isSending}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white disabled:opacity-40"
              >
                {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => openLoginModal?.()}
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <LogIn className="w-3.5 h-3.5" />
          Sign in to chat
        </button>
      )}
    </div>
  );
}
