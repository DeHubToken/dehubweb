import { useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Repeat2, Share } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { UserAvatar } from '@/components/app/UserAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Post } from '@/types/app.types';
import { ImagesFeed } from '@/components/app/feeds/ImagesFeed';
import { VideosFeed } from '@/components/app/feeds/VideosFeed';
import { ShortsFeed } from '@/components/app/feeds/ShortsFeed';
import { LiveFeed } from '@/components/app/feeds/LiveFeed';

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    author: {
      id: 'a1',
      name: 'Alice Cooper',
      handle: '@alice_cooper',
      verified: false,
    },
    content: 'Just discovered this amazing new tech stack! The future is looking bright 🚀',
    createdAt: '2h',
    stats: { comments: 23, reposts: 12, likes: 124 },
  },
  {
    id: '2',
    author: {
      id: 'a2',
      name: 'Fitness Pro',
      handle: '@fitnesspro',
      verified: false,
    },
    content: 'Morning workout complete! 💪 Feeling stronger every day. #fitness #motivation',
    createdAt: '3h',
    stats: { comments: 8, reposts: 5, likes: 89 },
  },
  {
    id: '3',
    author: {
      id: 'a3',
      name: 'Tech Insider',
      handle: '@techinsider',
      verified: true,
    },
    content:
      'Breaking: New AI developments are reshaping how we think about creativity and automation. Thread 🧵',
    createdAt: '5h',
    stats: { comments: 156, reposts: 234, likes: 1024 },
  },
];

function PostCard({ post }: { post: Post }) {
  return (
    <article className="p-4 hover:bg-zinc-800/30 transition-colors">
      <div className="flex gap-3">
        <UserAvatar name={post.author.name} handle={post.author.handle} size="lg" className="hidden sm:flex" />
        <UserAvatar name={post.author.name} handle={post.author.handle} size="md" className="flex sm:hidden" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{post.author.name}</span>
            <span className="text-zinc-500 text-sm truncate">{post.author.handle}</span>
            <span className="text-zinc-500 text-sm">· {post.createdAt}</span>
            <button className="ml-auto text-zinc-500 hover:text-white transition-colors p-1">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          <p className="mt-2 text-white/90 text-sm sm:text-base">{post.content}</p>

          <div className="flex items-center gap-4 sm:gap-8 mt-4 text-zinc-500">
            <button className="flex items-center gap-1 sm:gap-2 hover:text-blue-400 transition-colors">
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.comments}</span>
            </button>
            <button className="flex items-center gap-1 sm:gap-2 hover:text-green-400 transition-colors">
              <Repeat2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.reposts}</span>
            </button>
            <button className="flex items-center gap-1 sm:gap-2 hover:text-red-400 transition-colors">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm">{post.stats.likes}</span>
            </button>
            <button className="hover:text-blue-400 transition-colors">
              <Share className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function StoriesBar() {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide">
        {['Your Story', 'alice', 'bob', 'charlie', 'diana', 'evan', 'fiona'].map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`p-0.5 rounded-full ${i === 0 ? 'bg-zinc-700' : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500'}`}>
              <div className="p-0.5 bg-zinc-900 rounded-full">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} />
                  <AvatarFallback className="bg-zinc-700">{name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <span className="text-xs text-zinc-400 truncate w-16 text-center">
              {i === 0 ? 'Add Story' : name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
      <StoriesBar />
      {MOCK_POSTS.map((post) => (
        <div key={post.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
          <PostCard post={post} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('home');
  const [showShortsFilters, setShowShortsFilters] = useState(false);
  const [showImagesCollage, setShowImagesCollage] = useState(false);

  const handleTabClick = (tabValue: string) => {
    if (tabValue === 'shorts' && activeTab === 'shorts') {
      setShowShortsFilters((prev) => !prev);
    } else if (tabValue === 'images' && activeTab === 'images') {
      setShowImagesCollage((prev) => !prev);
    } else {
      setActiveTab(tabValue);
      if (tabValue !== 'shorts') {
        setShowShortsFilters(false);
      }
      if (tabValue !== 'images') {
        setShowImagesCollage(false);
      }
    }
  };

  const renderFeed = () => {
    switch (activeTab) {
      case 'images':
        return <ImagesFeed showCollage={showImagesCollage} />;
      case 'videos':
        return <VideosFeed />;
      case 'shorts':
        return <ShortsFeed showFilters={showShortsFilters} />;
      case 'live':
        return <LiveFeed />;
      default:
        return <HomeFeed />;
    }
  };

  return (
    <>
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 mt-2 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTabClick(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-4 h-4 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {renderFeed()}
    </>
  );
}
