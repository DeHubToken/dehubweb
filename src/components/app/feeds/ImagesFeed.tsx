import { useRef } from 'react';
import { Heart, MessageCircle, Bookmark, Share, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface InstagramPost {
  id: string;
  username: string;
  verified: boolean;
  avatar: string;
  image: string;
  likes: number;
  caption: string;
  comments: number;
  timeAgo: string;
}

interface ImagesFeedProps {
  showCollage?: boolean;
}

const MOCK_POSTS: InstagramPost[] = [
  {
    id: '1',
    username: 'travel_adventures',
    verified: true,
    avatar: 'travel',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop',
    likes: 2453,
    caption: 'Exploring the mountains 🏔️ Nothing beats this view! #travel #adventure #nature',
    comments: 89,
    timeAgo: '2 hours ago',
  },
  {
    id: '2',
    username: 'foodie_life',
    verified: false,
    avatar: 'food',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop',
    likes: 1832,
    caption: 'Homemade pizza night 🍕 Recipe in bio! #foodie #homemade #pizza',
    comments: 156,
    timeAgo: '4 hours ago',
  },
  {
    id: '3',
    username: 'fitness_motivation',
    verified: true,
    avatar: 'fitness',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=600&fit=crop',
    likes: 5621,
    caption: 'Morning workout complete 💪 Consistency is key! #fitness #gym #motivation',
    comments: 234,
    timeAgo: '6 hours ago',
  },
  {
    id: '4',
    username: 'nature_lover',
    verified: false,
    avatar: 'nature',
    image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop',
    likes: 3421,
    caption: 'Lost in the wilderness 🌲 #nature #outdoors',
    comments: 98,
    timeAgo: '8 hours ago',
  },
  {
    id: '5',
    username: 'city_vibes',
    verified: true,
    avatar: 'city',
    image: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=600&h=600&fit=crop',
    likes: 4102,
    caption: 'City lights ✨ #urban #cityscape',
    comments: 167,
    timeAgo: '10 hours ago',
  },
  {
    id: '6',
    username: 'art_gallery',
    verified: false,
    avatar: 'art',
    image: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&h=600&fit=crop',
    likes: 2891,
    caption: 'Art speaks where words fail 🎨 #art #creative',
    comments: 73,
    timeAgo: '12 hours ago',
  },
  {
    id: '7',
    username: 'beach_life',
    verified: true,
    avatar: 'beach',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop',
    likes: 5892,
    caption: 'Paradise found 🏝️ #beach #summer',
    comments: 245,
    timeAgo: '14 hours ago',
  },
  {
    id: '8',
    username: 'coffee_addict',
    verified: false,
    avatar: 'coffee',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop',
    likes: 1567,
    caption: 'But first, coffee ☕ #coffee #morning',
    comments: 56,
    timeAgo: '16 hours ago',
  },
  {
    id: '9',
    username: 'street_style',
    verified: true,
    avatar: 'style',
    image: 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=600&h=600&fit=crop',
    likes: 3245,
    caption: 'Street vibes 🚶 #streetphotography #urban',
    comments: 112,
    timeAgo: '18 hours ago',
  },
];

function CollageView({ posts }: { posts: InstagramPost[] }) {
  return (
    <div className="p-1 sm:p-2">
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {posts.map((post, index) => {
          // Every 3rd item (index 2, 5, 8...) is a large tile spanning 2x2
          const isLargeTile = (index + 1) % 3 === 0 && index !== 0;
          
          return (
            <div
              key={post.id}
              className={cn(
                'relative aspect-square bg-zinc-800 overflow-hidden group cursor-pointer',
                isLargeTile && 'col-span-2 row-span-2'
              )}
            >
              <img
                src={post.image}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <Heart className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.likes.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-white">
                  <MessageCircle className="w-4 h-4 sm:w-6 sm:h-6 fill-white" />
                  <span className="font-semibold text-xs sm:text-base">{post.comments}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndlessScrollView({ posts }: { posts: InstagramPost[] }) {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      {posts.map((post) => (
        <div key={post.id} className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="p-0.5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500">
                <div className="p-0.5 bg-zinc-900 rounded-full">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.avatar}`} />
                    <AvatarFallback className="bg-zinc-700">{post.username[0]}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white text-sm">{post.username}</span>
                  {post.verified && (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
            <button className="text-zinc-400 hover:text-white">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Image */}
          <div className="aspect-square bg-zinc-800">
            <img src={post.image} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Actions */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <button className="text-white hover:text-red-400 transition-colors">
                  <Heart className="w-6 h-6" />
                </button>
                <button className="text-white hover:text-zinc-400 transition-colors">
                  <MessageCircle className="w-6 h-6" />
                </button>
                <button className="text-white hover:text-zinc-400 transition-colors">
                  <Share className="w-6 h-6" />
                </button>
              </div>
              <button className="text-white hover:text-zinc-400 transition-colors">
                <Bookmark className="w-6 h-6" />
              </button>
            </div>

            <p className="font-semibold text-white text-sm mb-1">
              {post.likes.toLocaleString()} likes
            </p>

            <p className="text-white text-sm">
              <span className="font-semibold">{post.username}</span>{' '}
              <span className="text-zinc-300">{post.caption}</span>
            </p>

            <button className="text-zinc-500 text-sm mt-1">
              View all {post.comments} comments
            </button>

            <p className="text-zinc-500 text-xs mt-1">{post.timeAgo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ImagesFeed({ showCollage = false }: ImagesFeedProps) {
  const hasAnimated = useRef(false);
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  return (
    <AnimatePresence mode="wait">
      {showCollage ? (
        <motion.div
          key="collage"
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CollageView posts={MOCK_POSTS} />
        </motion.div>
      ) : (
        <motion.div
          key="endless"
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <EndlessScrollView posts={MOCK_POSTS} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}