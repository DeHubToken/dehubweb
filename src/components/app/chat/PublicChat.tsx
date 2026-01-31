import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Settings, MoreVertical, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage, Message } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface PublicChatProps {
  onBack: () => void;
}

export function PublicChat({ onBack }: PublicChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

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
            <h2 className="font-bold text-white">Public Chat</h2>
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
      <div className="relative flex-1">
        <div 
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto py-2"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <MessageCircle className="w-12 h-12 text-zinc-700" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs text-zinc-600">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      
      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
