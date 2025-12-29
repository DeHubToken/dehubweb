import { useState } from 'react';
import { 
  Home, Search, Bell, Mail, Trophy, Bookmark, Settings, 
  FileText, User, Image, Video, Film, Radio, Heart, 
  MessageCircle, Repeat2, Share, MoreHorizontal 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const NAV_ITEMS = [
  { icon: User, label: 'Profile' },
  { icon: Search, label: 'Explore' },
  { icon: Bell, label: 'Notifications' },
  { icon: Mail, label: 'Messages' },
  { icon: Trophy, label: 'Leaderboard' },
  { icon: Bookmark, label: 'Bookmarks' },
  { icon: Settings, label: 'Settings' },
  { icon: FileText, label: 'Blog' },
  { icon: Home, label: 'Home' },
];

const FEED_TABS = [
  { icon: Home, label: 'Home' },
  { icon: Image, label: 'Images' },
  { icon: Video, label: 'Videos' },
  { icon: Film, label: 'Shorts' },
  { icon: Radio, label: 'Cams' },
];

const MOCK_POSTS = [
  {
    id: 1,
    author: 'Alice Cooper',
    handle: '@alice_cooper',
    time: '2h',
    content: 'Just discovered this amazing new tech stack! The future is looking bright 🚀',
    comments: 23,
    reposts: 12,
    likes: 124,
  },
  {
    id: 2,
    author: 'Fitness Pro',
    handle: '@fitnesspro',
    time: '3h',
    content: 'Morning workout complete! 💪 Feeling stronger every day. #fitness #motivation',
    comments: 8,
    reposts: 5,
    likes: 89,
  },
  {
    id: 3,
    author: 'Tech Insider',
    handle: '@techinsider',
    time: '5h',
    content: 'Breaking: New AI developments are reshaping how we think about creativity and automation. Thread 🧵',
    comments: 156,
    reposts: 234,
    likes: 1024,
  },
];

const SUGGESTED_USERS = [
  { name: 'React Team', handle: '@reactjs', verified: true },
  { name: 'TypeScript', handle: '@typescript', verified: true },
  { name: 'Tailwind CSS', handle: '@tailwindcss', verified: true },
  { name: 'Vite.js', handle: '@vitejs', verified: true },
  { name: 'Web3 Builder', handle: '@web3builder', verified: false },
];

const TRENDING = [
  { tag: '#WebDevelopment', posts: '125K posts' },
  { tag: '#React', posts: '89K posts' },
  { tag: '#AI', posts: '234K posts' },
  { tag: '#Crypto', posts: '67K posts' },
];

const AppHome = () => {
  const [activeTab, setActiveTab] = useState('Home');

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex max-w-7xl mx-auto">
        {/* Left Sidebar */}
        <aside className="w-64 h-screen sticky top-0 p-4 flex flex-col border-r border-zinc-800">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">dehub</h1>
          </div>
          
          <nav className="flex-1 space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                className="flex items-center gap-4 w-full px-4 py-3 rounded-full hover:bg-zinc-900 transition-colors text-lg"
              >
                <item.icon className="w-6 h-6" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          
          <Button className="w-full rounded-full bg-white text-black hover:bg-zinc-200 font-semibold py-6 text-lg">
            Post
          </Button>
        </aside>

        {/* Main Feed */}
        <main className="flex-1 border-r border-zinc-800 min-h-screen">
          {/* Feed Tabs */}
          <div className="sticky top-0 bg-black/80 backdrop-blur-sm border-b border-zinc-800 z-10">
            <div className="flex justify-center gap-2 p-2">
              {FEED_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(tab.label)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                    activeTab === tab.label 
                      ? 'bg-zinc-800 text-white' 
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Posts */}
          <div className="divide-y divide-zinc-800">
            {MOCK_POSTS.map((post) => (
              <article key={post.id} className="p-4 hover:bg-zinc-900/50 transition-colors">
                <div className="flex gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.handle}`} />
                    <AvatarFallback className="bg-zinc-700">{post.author[0]}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{post.author}</span>
                      <span className="text-zinc-500">{post.handle}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-500">{post.time}</span>
                      <button className="ml-auto text-zinc-500 hover:text-white">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <p className="mt-2 text-white/90">{post.content}</p>
                    
                    <div className="flex items-center gap-8 mt-4 text-zinc-500">
                      <button className="flex items-center gap-2 hover:text-blue-400 transition-colors">
                        <MessageCircle className="w-5 h-5" />
                        <span>{post.comments}</span>
                      </button>
                      <button className="flex items-center gap-2 hover:text-green-400 transition-colors">
                        <Repeat2 className="w-5 h-5" />
                        <span>{post.reposts}</span>
                      </button>
                      <button className="flex items-center gap-2 hover:text-red-400 transition-colors">
                        <Heart className="w-5 h-5" />
                        <span>{post.likes}</span>
                      </button>
                      <button className="hover:text-blue-400 transition-colors">
                        <Share className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-80 h-screen sticky top-0 p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <Input 
              placeholder="Search..." 
              className="w-full pl-10 bg-zinc-900 border-zinc-800 rounded-full text-white placeholder:text-zinc-500 focus:border-zinc-700"
            />
          </div>

          {/* Who to Follow */}
          <div className="bg-zinc-900 rounded-2xl p-4">
            <h3 className="font-bold text-lg mb-4">Who to follow</h3>
            <div className="space-y-3">
              {SUGGESTED_USERS.map((user) => (
                <div key={user.handle} className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.handle}`} />
                    <AvatarFallback className="bg-zinc-700">{user.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold truncate">{user.name}</span>
                      {user.verified && (
                        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-zinc-500 text-sm truncate block">{user.handle}</span>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full border-zinc-700 text-white hover:bg-zinc-800">
                    Follow
                  </Button>
                </div>
              ))}
            </div>
            <button className="text-blue-400 hover:text-blue-300 mt-4 text-sm">Show more</button>
          </div>

          {/* Trending */}
          <div className="bg-zinc-900 rounded-2xl p-4">
            <h3 className="font-bold text-lg mb-4">What's happening</h3>
            <div className="space-y-4">
              {TRENDING.map((item) => (
                <div key={item.tag} className="hover:bg-zinc-800 -mx-2 px-2 py-1 rounded-lg cursor-pointer transition-colors">
                  <p className="font-semibold">{item.tag}</p>
                  <p className="text-zinc-500 text-sm">{item.posts}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AppHome;
