import { useState, useCallback } from 'react';
import { Pin, ShieldBan, ShieldCheck, MoreVertical, Loader2, RotateCcw, Languages } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TranslatableText, renderTextWithLinks } from '../TranslatableText';
import { useTranslation as useTextTranslation } from '../TranslatableText';
import { useLiveChatUser } from '@/hooks/use-livechat';
import { useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userAvatar?: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'gif';
  imageUrl?: string;
  isPinned?: boolean;
}

interface ChatMessageProps {
  message: Message;
  showActions?: boolean;
  moderators?: string[];
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onBan?: (userId: string, userName: string) => void;
  onUnban?: (userId: string, userName: string) => void;
}

/** Inline moderator badge shown next to the username */
function ModeratorBadge({ address, moderators }: { address: string; moderators?: string[] }) {
  // Check against room's moderators list (source of truth from API)
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


/** Inline staking badge — no longer fetched via edge function (livechat has no badge data) */
function StakingBadgeInline({ address: _address }: { address: string }) {
  return null;
}

export function ChatMessage({ message, showActions, moderators, onPin, onUnpin, onBan, onUnban }: ChatMessageProps) {
  const navigate = useNavigate();
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

  const isClickable = !!message.userHandle;

  return (
    <div className={`flex gap-3 py-2 px-4 hover:bg-zinc-800/30 transition-colors group ${message.isPinned ? 'bg-yellow-500/5 border-l-2 border-yellow-500/30' : ''}`}>
      <button
        onClick={handleProfileClick}
        disabled={!isClickable}
        className={`flex-shrink-0 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <Avatar className="w-8 h-8">
          {message.userAvatar && <AvatarImage src={message.userAvatar} />}
          <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
            {message.userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="relative inline-flex items-baseline">
            <button
              onClick={handleProfileClick}
              disabled={!isClickable}
              className={`font-semibold text-white text-sm ${isClickable ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
            >
              {message.userName}
            </button>
            <StakingBadgeInline address={message.userId} />
          </span>
          <ModeratorBadge address={message.userId} />
          {message.isPinned && (
            <span className="flex items-center gap-1 text-yellow-500/70 text-xs">
              <Pin className="w-3 h-3" />
              Pinned
            </span>
          )}
          
          {/* Action menu - visible on hover */}
          {showActions && (
            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
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
            </div>
          )}
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
      </div>
    </div>
  );
}
