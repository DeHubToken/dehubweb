/**
 * RealtimeChatPanel
 * =================
 * The message list + composer shared by every Supabase-backed chat surface
 * (TV channels, Stages). Presentational only: it owns the composer, reply,
 * edit and scroll state, and takes the messages and the write callbacks from
 * whichever hook owns the table.
 *
 * Lifted out of TVChat verbatim rather than written fresh. The chat tables
 * (community_chat_messages, event_chat_messages, tv_chat_messages,
 * stage_chat_messages) deliberately carry the same columns so a message looks
 * identical wherever it is read, and that promise only holds if one component
 * draws it.
 *
 * @module components/app/chat/RealtimeChatPanel
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import {
  Send, Loader2, SmilePlus, Reply, CornerDownRight, X, MessageSquare, LogIn,
  Pencil, Check, Trash2, ArrowDown, type LucideIcon,
} from 'lucide-react';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TranslatableText, SharedTranslationProvider } from '../TranslatableText';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/**
 * One row of any of the chat tables. The columns are the same across all of
 * them by design — see the migration headers.
 */
export interface RealtimeChatMessage {
  id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

/** Who the message is stamped with — read off the signed-in user by the panel. */
export interface ChatSenderProfile {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  badgeBalance?: number;
}

export interface RealtimeChatPanelProps {
  messages: RealtimeChatMessage[];
  isLoading: boolean;
  onSend: (content: string, replyToId: string | undefined, profile: ChatSenderProfile) => Promise<void>;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  /**
   * Delete rights beyond "it is mine" — the stage host clearing their own
   * room. Editing stays with the author either way: a host rewriting what
   * somebody said is a different feature, and not a good one.
   */
  canModerate?: boolean;
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  emptyHint?: string;
  placeholder?: string;
  signInLabel?: string;
  /** Height of the scrolling list — the main thing that differs per surface. */
  listClassName?: string;
  className?: string;
  maxLength?: number;
  /** Rendered in place of the list. Use for "this surface is not available". */
  error?: string | null;
  /** Sits under the composer. */
  footer?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

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

export function RealtimeChatPanel({
  messages,
  isLoading,
  onSend,
  onEdit,
  onDelete,
  onReact,
  onRemoveReaction,
  canModerate = false,
  title = 'Live chat',
  subtitle,
  icon: Icon = MessageSquare,
  emptyHint = 'No messages yet — say something.',
  placeholder = 'Type here...',
  signInLabel = 'Sign in to chat',
  listClassName = 'h-56',
  className,
  maxLength = 500,
  error = null,
  footer,
  onClick,
}: RealtimeChatPanelProps) {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<RealtimeChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const navigate = useNavigate();
  const { user, walletAddress, isAuthenticated, openLoginModal } = useAuth();

  // Track whether the reader is pinned to the bottom; only auto-scroll if so,
  // otherwise a busy room yanks the view while they are reading back.
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
        // `nearest`, not `end`: this panel is nested inside taller scrollers
        // (the Stages drawer), and `end` walks up the ancestor chain and drags
        // the whole room down to reach it.
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      await onSend(text, replyTo?.id, {
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
  }, [newMessage, isSending, isAuthenticated, walletAddress, openLoginModal, onSend, replyTo, user, scrollToBottom]);

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
    if (mine) onRemoveReaction(id, emoji);
    else onReact(id, emoji);
  };

  return (
    <div
      className={cn('rounded-xl border border-white/[0.12] bg-white/[0.03] p-3', className)}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs font-semibold text-white">{title}</span>
        {subtitle && (
          <span className="text-[10px] text-zinc-500 truncate">· {subtitle}</span>
        )}
      </div>

      <SharedTranslationProvider>
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={cn('overflow-y-auto space-y-1 scrollbar-hide', listClassName)}
          >
            {error ? (
              <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
                <Icon className="w-5 h-5 text-zinc-700" />
                <p className="text-[11px] text-zinc-500">{error}</p>
              </div>
            ) : isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
                <Icon className="w-5 h-5 text-zinc-700" />
                <p className="text-[11px] text-zinc-500">{emptyHint}</p>
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
                                  onEdit(msg.id, editText);
                                  setEditingId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="flex-1 text-xs text-white bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-white/20"
                              maxLength={maxLength}
                            />
                            <button
                              onClick={() => { onEdit(msg.id, editText); setEditingId(null); }}
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
                            onReact={onReact}
                            onRemoveReaction={onRemoveReaction}
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
                          {(isMine || canModerate) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { if (confirm('Delete this message?')) onDelete(msg.id); }}
                                  className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">{isMine ? 'Delete' : 'Remove'}</TooltipContent>
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
              <span className="absolute top-1 right-0 text-[10px] text-zinc-600 z-10">{newMessage.length}/{maxLength}</span>
              <Textarea
                ref={textareaRef}
                placeholder={placeholder}
                value={newMessage}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= maxLength) setNewMessage(val);
                  const ta = e.target;
                  requestAnimationFrame(() => {
                    ta.style.height = 'auto';
                    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
                  });
                }}
                onKeyDown={handleKeyDown}
                maxLength={maxLength}
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
          {signInLabel}
        </button>
      )}

      {footer}
    </div>
  );
}
