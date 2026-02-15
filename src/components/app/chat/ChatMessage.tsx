import { Pin, ShieldBan, ShieldCheck, MoreVertical } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TranslatableText } from '../TranslatableText';
import { useLiveChatUser } from '@/hooks/use-livechat';
import { useNavigate } from 'react-router-dom';
import { useBadgeBalance } from '@/hooks/use-badge-balance';
import { getBadgeUrl } from '@/lib/staking-badges';
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
  onPin?: (messageId: string) => void;
  onUnpin?: (messageId: string) => void;
  onBan?: (userId: string, userName: string) => void;
  onUnban?: (userId: string, userName: string) => void;
}

/** Inline moderator badge shown next to the username */
function ModeratorBadge({ address }: { address: string }) {
  const { profile } = useLiveChatUser(address);
  if (!profile?.isModerator) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center text-emerald-400">
          <ShieldCheck className="w-3 h-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Moderator</TooltipContent>
    </Tooltip>
  );
}


/** Inline staking badge (blue tick) shown next to display name */
function StakingBadgeInline({ address }: { address: string }) {
  const { badgeBalance } = useBadgeBalance(address);
  const badgeUrl = getBadgeUrl(badgeBalance);
  if (!badgeUrl) return null;
  return (
    <img src={badgeUrl} alt="Badge" className="w-[9px] h-[9px] shrink-0 absolute -top-0.5 -right-3" />
  );
}

export function ChatMessage({ message, showActions, onPin, onUnpin, onBan, onUnban }: ChatMessageProps) {
  const navigate = useNavigate();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          <p className="text-zinc-300 text-sm break-words">
            <TranslatableText text={message.content} className="inline" as="span" />
            <span className="text-zinc-500 text-[10px] ml-2 align-baseline whitespace-nowrap">{formatTime(message.timestamp)}</span>
          </p>
        )}
        
        {message.type === 'image' && message.imageUrl && (
          <div className="mt-1">
            <img 
              src={message.imageUrl} 
              alt="Shared image" 
              className="max-w-xs max-h-64 rounded-lg object-cover"
            />
            {message.content && (
              <TranslatableText text={message.content} className="text-zinc-300 text-sm mt-1" as="p" />
            )}
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
