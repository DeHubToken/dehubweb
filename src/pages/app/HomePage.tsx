import { useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Repeat2, Share } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { UserAvatar } from '@/components/app/UserAvatar';
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

function HomeFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
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

  const renderFeed = () => {
    switch (activeTab) {
      case 'images':
        return <ImagesFeed />;
      case 'videos':
        return <VideosFeed />;
      case 'shorts':
        return <ShortsFeed />;
      case 'live':
        return <LiveFeed />;
      default:
        return <HomeFeed />;
    }
  };

  return (
    <>
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 mt-1 lg:mt-0">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
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
