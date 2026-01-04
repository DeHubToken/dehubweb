import { useState, useRef, useEffect } from 'react';
import { Send, Smile, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatMessage {
  id: string;
  userName: string;
  content: string;
  timestamp: Date;
}

const initialMessages: ChatMessage[] = [
  { id: '1', userName: 'CryptoKing', content: 'Hey everyone! 🔥', timestamp: new Date(Date.now() - 60000 * 5) },
  { id: '2', userName: 'GamerGirl99', content: 'This community is awesome', timestamp: new Date(Date.now() - 60000 * 3) },
  { id: '3', userName: 'TechWizard', content: 'Just joined!', timestamp: new Date(Date.now() - 60000 * 1) },
];

export function SidebarChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      userName: 'You',
      content: newMessage.trim(),
      timestamp: new Date(),
    }]);
    setNewMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
        <span className="text-zinc-400 text-xs flex items-center gap-1">
          <Users className="w-3 h-3" /> 2.3k online
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2">
            <Avatar className="w-6 h-6 flex-shrink-0">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userName}`} />
              <AvatarFallback className="bg-zinc-700 text-white text-[10px]">
                {msg.userName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white">{msg.userName}</span>
              <p className="text-xs text-zinc-300 break-words">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <Input
          placeholder="Say something..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 h-8 bg-zinc-800 border-zinc-700 text-white text-xs placeholder:text-zinc-500 rounded-lg"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={handleSend}
          disabled={!newMessage.trim()}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
