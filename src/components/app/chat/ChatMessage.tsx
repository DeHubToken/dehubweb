import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TranslatableText } from '../TranslatableText';

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'gif';
  imageUrl?: string;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex gap-3 py-2 px-4 hover:bg-zinc-800/30 transition-colors group">
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={message.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.userName}`} />
        <AvatarFallback className="bg-zinc-700 text-white text-xs">
          {message.userName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-white text-sm">{message.userName}</span>
          <span className="text-zinc-500 text-xs">{formatTime(message.timestamp)}</span>
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
