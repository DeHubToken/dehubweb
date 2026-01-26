import { useState, useRef } from 'react';
import { Send, Smile, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TranslatableText } from '../TranslatableText';

interface ChatMessage {
  id: string;
  userName: string;
  content: string;
  timestamp: Date;
}

export function SidebarChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      userName: 'You',
      content: newMessage.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMsg]);
    setNewMessage('');
    
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full px-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
        <span className="text-zinc-400 text-xs flex items-center gap-1">
          <Users className="w-3 h-3" /> 0 online
        </span>
      </div>

      {/* Messages */}
      <div className="relative flex-1">
        <div className="absolute inset-0 overflow-y-auto py-2 space-y-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
                <Users className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-zinc-500 text-xs">No messages yet</p>
              <p className="text-zinc-600 text-xs">Be the first to say hello!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-2">
                <Avatar className="w-6 h-6 flex-shrink-0">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userName}`} />
                  <AvatarFallback className="bg-zinc-700 text-white text-[10px]">
                    {msg.userName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-white">{msg.userName}</span>
                  <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Smile className="w-4 h-4 text-zinc-500" />
          </Button>
          <Input
            placeholder="Send a message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm bg-zinc-800 border-zinc-700 rounded-lg"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="h-8 w-8 flex items-center justify-center disabled:opacity-40"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}