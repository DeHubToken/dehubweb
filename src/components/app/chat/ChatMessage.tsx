import { useState } from 'react';
import { Pin, ShieldBan, ShieldCheck, MoreVertical, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TranslatableText } from '../TranslatableText';
import { useLiveChatUser } from '@/hooks/use-livechat';
import { getMediaUrl } from '@/lib/api/dehub';
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

export interface Message {
  id: string;
  userId: string;
  userName: string;
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
}

function UserProfilePopover({ address, children }: { address: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { profile, isLoading } = useLiveChatUser(open ? address : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-56 bg-zinc-900 border-zinc-700 p-3 text-white"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          </div>
        ) : profile ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                {profile.avatarImageUrl && (
                  <AvatarImage src={getMediaUrl(profile.avatarImageUrl)} />
                )}
                <AvatarFallback className="bg-zinc-700 text-white text-sm font-medium">
                  {(profile.displayName || profile.username || address)
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white truncate">
                  {profile.displayName || profile.username || address.slice(0, 10)}
                </p>
                {profile.username && (
                  <p className="text-xs text-zinc-400 truncate">@{profile.username}</p>
                )}
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5">
              {profile.isModerator && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Moderator
                </span>
              )}
              {profile.isBanned && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  <ShieldBan className="w-3 h-3" />
                  Banned
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 truncate font-mono">{address}</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 text-center py-2">Profile not found</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ChatMessage({ message, showActions, onPin, onUnpin, onBan }: ChatMessageProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex gap-3 py-2 px-4 hover:bg-zinc-800/30 transition-colors group ${message.isPinned ? 'bg-yellow-500/5 border-l-2 border-yellow-500/30' : ''}`}>
      <Avatar className="w-8 h-8 flex-shrink-0">
        {message.userAvatar && <AvatarImage src={message.userAvatar} />}
        <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
          {message.userName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <UserProfilePopover address={message.userId}>
            <button className="font-semibold text-white text-sm hover:underline cursor-pointer">
              {message.userName}
            </button>
          </UserProfilePopover>
          <span className="text-zinc-500 text-xs">{formatTime(message.timestamp)}</span>
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        
        {message.type === 'text' && (
          <TranslatableText text={message.content} className="text-zinc-300 text-sm break-words" as="p" />
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
