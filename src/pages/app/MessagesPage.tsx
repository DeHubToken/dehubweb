import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage: string;
  time: string;
  unread?: number;
  isLive?: boolean;
  liveCount?: string;
  isPinned?: boolean;
}

const conversations: Conversation[] = [
  {
    id: '1',
    name: 'Public Chat',
    lastMessage: 'Welcome to the commu...',
    time: '',
    isLive: true,
    liveCount: '2.3k',
    isPinned: true,
  },
  {
    id: '2',
    name: 'Alice Cooper',
    lastMessage: 'Hey! How are you doing ...',
    time: '2m',
    unread: 2,
  },
  {
    id: '3',
    name: 'Tech Guru',
    lastMessage: 'That new project looks a...',
    time: '1h',
  },
  {
    id: '4',
    name: 'Design Master',
    lastMessage: 'Can we schedule a call t...',
    time: '3h',
    unread: 1,
  },
];

export default function MessagesPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="h-[calc(100vh-120px)] lg:h-[calc(100vh-32px)]">
        {/* Full Width Messages Panel */}
        <div className="w-full h-full bg-zinc-900 rounded-2xl flex flex-col">
          {/* Header */}
          <div className="p-4">
            <h1 className="text-xl font-bold text-white mb-4">Messages</h1>
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
              />
              <Button 
                size="icon" 
                className="absolute right-1.5 w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600"
              >
                <Plus className="w-4 h-4 text-white" />
              </Button>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors text-left ${
                  selectedConversation === conv.id ? 'bg-zinc-800' : ''
                }`}
              >
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.name}`} />
                    <AvatarFallback className="bg-zinc-700 text-white">
                      {conv.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {conv.isPinned && (
                    <div className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-[10px]">📌</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white truncate">{conv.name}</span>
                    {conv.isLive && (
                      <>
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
                        <span className="text-zinc-500 text-sm">{conv.liveCount}</span>
                      </>
                    )}
                    {conv.time && <span className="text-zinc-500 text-sm ml-auto">{conv.time}</span>}
                  </div>
                  <p className="text-zinc-500 text-sm truncate">{conv.lastMessage}</p>
                </div>
                {conv.unread && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{conv.unread}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
