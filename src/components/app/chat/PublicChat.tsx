import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Users, Settings, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage, Message } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface PublicChatProps {
  onBack: () => void;
  liveCount?: string;
}

// Mock initial messages
const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    userId: 'system',
    userName: 'DeHub Bot',
    content: 'Welcome to the Public Chat! Be respectful and have fun. 🎉',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    type: 'text',
  },
  {
    id: '2',
    userId: 'user1',
    userName: 'CryptoKing',
    content: "Hey everyone! Who's excited about the new update?",
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    type: 'text',
  },
  {
    id: '3',
    userId: 'user2',
    userName: 'GamerGirl99',
    content: "Just joined! This community is awesome 🔥",
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
    type: 'text',
  },
  {
    id: '4',
    userId: 'user3',
    userName: 'TechWizard',
    userAvatar: '',
    content: '',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    type: 'gif',
    imageUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  },
  {
    id: '5',
    userId: 'user4',
    userName: 'ArtistVibes',
    content: 'Check out this cool art I found!',
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
    type: 'image',
    imageUrl: 'https://images.unsplash.com/photo-1634017839464-5c339bbe3c35?w=400&h=300&fit=crop',
  },
];

export function PublicChat({ onBack, liveCount = '2.3k' }: PublicChatProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (content: string, type: 'text' | 'image' | 'gif', imageUrl?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      userId: 'currentUser',
      userName: 'You',
      content,
      timestamp: new Date(),
      type,
      imageUrl,
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white">Public Chat</h2>
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-500 text-xs">
              <Users className="w-3 h-3" />
              <span>{liveCount} online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-2">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      
      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
