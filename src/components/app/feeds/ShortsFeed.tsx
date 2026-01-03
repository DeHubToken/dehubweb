import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TikTokVideo {
  id: string;
  username: string;
  verified: boolean;
  description: string;
  sound: string;
  likes: string;
  comments: string;
  shares: string;
  thumbnail: string;
}

const MOCK_SHORTS: TikTokVideo[] = [
  {
    id: '1',
    username: 'dancequeen',
    verified: true,
    description: 'New dance trend 🔥 #dance #trending #viral',
    sound: 'Original Sound - dancequeen',
    likes: '2.5M',
    comments: '45K',
    shares: '12K',
    thumbnail: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=300&h=500&fit=crop',
  },
  {
    id: '2',
    username: 'comedyking',
    verified: false,
    description: 'POV: When your mom calls you by your full name 😂',
    sound: 'Funny Sound Effect',
    likes: '890K',
    comments: '23K',
    shares: '8.5K',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=500&fit=crop',
  },
  {
    id: '3',
    username: 'cookingwithme',
    verified: true,
    description: '60 second recipe that will blow your mind! 🍳 #cooking #recipe',
    sound: 'Cooking Beats - DJ Chef',
    likes: '1.2M',
    comments: '34K',
    shares: '56K',
    thumbnail: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=500&fit=crop',
  },
  {
    id: '4',
    username: 'petlovers',
    verified: false,
    description: 'My dog learned a new trick! 🐕 #pets #cute #dog',
    sound: 'Happy Vibes',
    likes: '3.1M',
    comments: '67K',
    shares: '89K',
    thumbnail: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=300&h=500&fit=crop',
  },
  {
    id: '5',
    username: 'fitnessguru',
    verified: true,
    description: '5 exercises you can do anywhere 💪 #fitness #workout',
    sound: 'Workout Motivation',
    likes: '567K',
    comments: '12K',
    shares: '34K',
    thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300&h=500&fit=crop',
  },
  {
    id: '6',
    username: 'magictricks',
    verified: true,
    description: 'Can you figure out how I did this? 🎩✨ #magic',
    sound: 'Mysterious Sound',
    likes: '4.2M',
    comments: '98K',
    shares: '120K',
    thumbnail: 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=300&h=500&fit=crop',
  },
];

const DURATION_OPTIONS = ['All', '< 15s', '15-60s', '> 60s'];
const CATEGORY_OPTIONS = ['All', 'Dance', 'Comedy', 'Food', 'Pets', 'Fitness', 'Magic'];

interface ShortsFeedProps {
  showFilters?: boolean;
}

export function ShortsFeed({ showFilters = false }: ShortsFeedProps) {
  const [selectedDuration, setSelectedDuration] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');

  return (
    <div className="p-2 sm:p-3">
      {/* Filters */}
      {showFilters && (
        <div className="mb-4 space-y-3">
        {/* Duration Filter */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
          <span className="text-zinc-400 text-sm whitespace-nowrap">Duration:</span>
          {DURATION_OPTIONS.map((duration) => (
            <button
              key={duration}
              onClick={() => setSelectedDuration(duration)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                selectedDuration === duration
                  ? 'bg-white text-black font-medium'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {duration}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-invisible pb-1">
          <span className="text-zinc-400 text-sm whitespace-nowrap">Category:</span>
          {CATEGORY_OPTIONS.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
                selectedCategory === category
                  ? 'bg-white text-black font-medium'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Shorts Grid - TikTok Style */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        {MOCK_SHORTS.map((short) => (
          <div
            key={short.id}
            className="relative aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden cursor-pointer group"
          >
            {/* Thumbnail */}
            <img
              src={short.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />


            {/* Bottom Info */}
            <div className="absolute bottom-2 left-2 right-14">
              <div className="flex items-center gap-1 mb-1">
                <span className="font-semibold text-white text-sm">@{short.username}</span>
                {short.verified && (
                  <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </div>
              <p className="text-white text-xs line-clamp-2">{short.description}</p>
              <div className="flex items-center gap-1 mt-1">
                <Music2 className="w-3 h-3 text-white" />
                <p className="text-white text-xs truncate">{short.sound}</p>
              </div>
            </div>

            {/* Play indicator on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
