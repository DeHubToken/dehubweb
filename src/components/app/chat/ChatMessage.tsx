import { useState, useCallback } from 'react';
import { Pin, ShieldBan, ShieldCheck, MoreVertical, Loader2, RotateCcw, Languages, SmilePlus, Reply, CornerDownRight, X } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { TranslatableText, renderTextWithLinks } from '../TranslatableText';
import { useTranslation as useTextTranslation } from '../TranslatableText';
import { useNavigate } from 'react-router-dom';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/** Avatar with cascading fallback: primary → CDN → initials */
function ChatAvatar({ src, address, name, className }: { src?: string; address?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src) : undefined;
  const activeSrc = failed ? cdnUrl : src;
  return (
    <Avatar className={className}>
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Reaction data: emoji → list of addresses who reacted */
export interface ReactionData {
  [emoji: string]: string[];
}

export interface ReplyToData {
  id: string;
  content: string;
  senderName: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userAvatar?: string;
  badgeBalance?: number | null;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'gif';
  imageUrl?: string;
  isPinned?: boolean;
  reactions?: ReactionData;
  replyTo?: ReplyToData;
}

interface ChatMessageProps {
  message: Message;
  showActions?: boolean;
  moderators?: string[];
  currentUserAddress?: string;
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onBan?: (userId: string, userName: string) => void;
  onUnban?: (userId: string, userName: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '👀', '💯', '🙏'];

/** Inline moderator badge shown next to the username */
function ModeratorBadge({ address, moderators }: { address: string; moderators?: string[] }) {
  const isMod = moderators?.some(
    (mod) => mod.toLowerCase() === address.toLowerCase()
  );
  if (!isMod) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-semibold bg-emerald-400/10 rounded px-1 py-0.5">
          <ShieldCheck className="w-3 h-3" />
          MOD
        </span>
      </TooltipTrigger>
      <TooltipContent>Moderator</TooltipContent>
    </Tooltip>
  );
}

/** Inline staking badge for chat messages */
function StakingBadgeInline({ badgeBalance, username }: { badgeBalance?: number | null; username?: string }) {
  return <BadgeIcon badgeBalance={badgeBalance} username={username} className="w-[9px] h-[9px] absolute -top-0.5 -right-0" />;
}

/** Reaction pills displayed below a message */
function ReactionBar({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
}: {
  reactions: ReactionData;
  currentUserAddress?: string;
  onReact?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  messageId: string;
}) {
  const entries = Object.entries(reactions).filter(([, addrs]) => addrs.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, addresses]) => {
        const myReaction = currentUserAddress
          ? addresses.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase())
          : false;
        return (
          <button
            key={emoji}
            onClick={() => {
              if (myReaction) {
                onRemoveReaction?.(messageId, emoji);
              } else {
                onReact?.(messageId, emoji);
              }
            }}
            className={`group/reaction inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border transition-colors ${
              myReaction
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <span>{emoji}</span>
            {myReaction ? (
              <>
                <span className="text-[10px] group-hover/reaction:hidden">{addresses.length}</span>
                <X className="w-3 h-3 hidden group-hover/reaction:block text-white" />
              </>
            ) : (
              <span className="text-[10px]">{addresses.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ChatMessage({
  message,
  showActions,
  moderators,
  currentUserAddress,
  onPin,
  onUnpin,
  onBan,
  onUnban,
  onReact,
  onRemoveReaction,
  onReply,
}: ChatMessageProps) {
  const navigate = useNavigate();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
  } = useTextTranslation(message.content);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  const handleProfileClick = () => {
    if (message.userHandle) {
      navigate(`/${message.userHandle}`);
    }
  };

  const handleQuickReact = useCallback((emoji: string) => {
    // Toggle: if already reacted with this emoji, remove it
    const myReactions = message.reactions?.[emoji] || [];
    const alreadyReacted = currentUserAddress && myReactions.some(
      (a) => a.toLowerCase() === currentUserAddress.toLowerCase()
    );
    if (alreadyReacted) {
      onRemoveReaction?.(message.id, emoji);
    } else {
      onReact?.(message.id, emoji);
    }
    setEmojiPickerOpen(false);
  }, [message.id, message.reactions, currentUserAddress, onReact, onRemoveReaction]);

  const isClickable = !!message.userHandle;

  return (
    <div id={`chat-msg-${message.id}`} className={`flex gap-3 py-2 px-4 hover:bg-zinc-800/30 transition-colors group ${message.isPinned ? 'bg-yellow-500/5 border-l-2 border-yellow-500/30' : ''}`}>
      <button
        onClick={handleProfileClick}
        disabled={!isClickable}
        className={`flex-shrink-0 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <ChatAvatar
          src={message.userAvatar}
          address={message.userId}
          name={message.userName}
          className="w-8 h-8"
        />
      </button>
      
      <div className="flex-1 min-w-0">
        {/* Reply indicator */}
        {message.replyTo && (
          <button
            onClick={() => {
              const el = document.getElementById(`chat-msg-${message.replyTo!.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-1', 'ring-white/40');
                setTimeout(() => el.classList.remove('ring-1', 'ring-white/40'), 2000);
              }
            }}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 mb-0.5 transition-colors"
          >
            <CornerDownRight className="w-3 h-3" />
            <span className="font-medium">{message.replyTo.senderName}</span>
            <span className="truncate max-w-[200px]">{message.replyTo.content}</span>
          </button>
        )}

        <div className="flex items-baseline gap-2">
          <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
            <button
              onClick={handleProfileClick}
              disabled={!isClickable}
              className={`font-semibold text-white text-sm truncate ${isClickable ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
            >
              {message.userName}
            </button>
            <StakingBadgeInline badgeBalance={message.badgeBalance} username={message.userHandle} />
          </span>
          <ModeratorBadge address={message.userId} moderators={moderators} />
          {message.isPinned && (
            <span className="flex items-center gap-1 text-yellow-500/70 text-xs">
              <Pin className="w-3 h-3" />
              Pinned
            </span>
          )}
          
          {/* Action buttons - visible on hover */}
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            {/* Reply button */}
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onReply(message)}
                    className="p-1 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-700/50"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
            )}

            {/* Reaction picker */}
            {onReact && (
              <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button className="p-1 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-700/50">
                        <SmilePlus className="w-3.5 h-3.5" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>React</TooltipContent>
                </Tooltip>
                <PopoverContent
                  side="top"
                  align="end"
                  className="w-auto p-1.5 bg-zinc-800 border-zinc-700 rounded-xl"
                >
                  <div className="flex gap-0.5">
                    {QUICK_EMOJIS.map((emoji) => {
                      const isActive = currentUserAddress && message.reactions?.[emoji]?.some(
                        (a) => a.toLowerCase() === currentUserAddress.toLowerCase()
                      );
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleQuickReact(emoji)}
                          className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg transition-colors ${
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
            )}

            {/* Mod actions */}
            {showActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-700/50">
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  {message.isPinned ? (
                    <DropdownMenuItem
                      onClick={() => onUnpin?.(message.id)}
                      className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                    >
                      <Pin className="w-4 h-4" />
                      Unpin
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => onPin?.(message.id)}
                      className="text-zinc-300 rounded-lg cursor-pointer focus:bg-transparent focus:text-white gap-2"
                    >
                      <Pin className="w-4 h-4" />
                      Pin Message
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onBan?.(message.userId, message.userName)}
                    className="text-red-400 rounded-lg cursor-pointer focus:bg-transparent focus:text-red-300 gap-2"
                  >
                    <ShieldBan className="w-4 h-4" />
                    Ban User
                  </DropdownMenuItem>
                  {onUnban && (
                    <DropdownMenuItem
                      onClick={() => onUnban(message.userId, message.userName)}
                      className="text-emerald-400 rounded-lg cursor-pointer focus:bg-transparent focus:text-emerald-300 gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Unban User
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        
        {message.type === 'text' && (
          <div>
            <p className="text-zinc-300 text-sm break-words whitespace-pre-wrap">
              {renderTextWithLinks(isTranslated ? translatedText : message.content)}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(message.timestamp)} {formatTime(message.timestamp)}</span>
              {!isTooShort && (
                isTranslateLoading ? (
                  <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
                ) : isTranslated ? (
                  <button onClick={handleShowOriginal} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <button onClick={handleTranslate} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <Languages className="w-3 h-3" />
                  </button>
                )
              )}
              {translateError && (
                <span className="text-zinc-500 text-[10px]">{translateError}</span>
              )}
            </div>
          </div>
        )}
        
        {message.type === 'image' && message.imageUrl && (
          <div className="mt-1">
            <img 
              src={message.imageUrl} 
              alt="Shared image" 
              className="max-w-xs max-h-64 rounded-lg object-cover"
            />
            {message.content && (
              <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap">
                {renderTextWithLinks(isTranslated ? translatedText : message.content)}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(message.timestamp)} {formatTime(message.timestamp)}</span>
              {message.content && !isTooShort && (
                isTranslateLoading ? (
                  <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
                ) : isTranslated ? (
                  <button onClick={handleShowOriginal} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <button onClick={handleTranslate} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <Languages className="w-3 h-3" />
                  </button>
                )
              )}
            </div>
          </div>
        )}
        
        {message.type === 'gif' && message.imageUrl && (
          <div className="mt-1">
            <img 
              src={message.imageUrl} 
              alt="GIF" 
              className="max-w-xs max-h-48 rounded-lg"
            />
          </div>
        )}

        {/* Reactions display */}
        {message.reactions && (
          <ReactionBar
            reactions={message.reactions}
            currentUserAddress={currentUserAddress}
            onReact={onReact}
            onRemoveReaction={onRemoveReaction}
            messageId={message.id}
          />
        )}
      </div>
    </div>
  );
}
