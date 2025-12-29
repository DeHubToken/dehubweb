import { useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Repeat2, Share } from 'lucide-react';
import { FEED_TABS } from '@/constants/app.constants';
import { UserAvatar } from '@/components/app/UserAvatar';
import type { Post } from '@/types/app.types';

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
    <article className="p-4 hover:bg-zinc-900/50 transition-colors">
      <div className="flex gap-3">
        <UserAvatar name={post.author.name} handle={post.author.handle} size="lg" />

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{post.author.name}</span>
            <span className="text-zinc-500">{post.author.handle}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-500">{post.createdAt}</span>
            <button className="ml-auto text-zinc-500 hover:text-white transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          <p className="mt-2 text-white/90">{post.content}</p>

          <div className="flex items-center gap-8 mt-4 text-zinc-500">
            <button className="flex items-center gap-2 hover:text-blue-400 transition-colors">
              <MessageCircle className="w-5 h-5" />
              <span>{post.stats.comments}</span>
            </button>
            <button className="flex items-center gap-2 hover:text-green-400 transition-colors">
              <Repeat2 className="w-5 h-5" />
              <span>{post.stats.reposts}</span>
            </button>
            <button className="flex items-center gap-2 hover:text-red-400 transition-colors">
              <Heart className="w-5 h-5" />
              <span>{post.stats.likes}</span>
            </button>
            <button className="hover:text-blue-400 transition-colors">
              <Share className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <>
      {/* Feed Tabs */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm border-b border-zinc-800 z-10">
        <div className="flex justify-center gap-2 p-2">
          {FEED_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                activeTab === tab.value
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
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </>
  );
}
