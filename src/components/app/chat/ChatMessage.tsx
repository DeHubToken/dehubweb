import { useState } from 'react';
import { Pin, ShieldBan, MoreVertical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TranslatableText } from '../TranslatableText';
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
          <span className="font-semibold text-white text-sm">{message.userName}</span>
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
