import { useRef, useMemo } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, Download, Flag, Ban, EyeOff, Repeat2, Send, Link, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  isRefreshing?: boolean;
  refreshKey?: number;
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
  {
    id: '10',
    username: 'sunset_chaser',
    verified: true,
    avatar: 'sunset',
    image: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=600&h=600&fit=crop',
    likes: 4521,
    caption: 'Golden hour magic ✨ #sunset #photography',
    comments: 198,
    timeAgo: '20 hours ago',
  },
  {
    id: '11',
    username: 'pet_paradise',
    verified: false,
    avatar: 'pets',
    image: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=600&fit=crop',
    likes: 6782,
    caption: 'Best friend forever 🐕 #dogs #pets #cute',
    comments: 345,
    timeAgo: '22 hours ago',
  },
  {
    id: '12',
    username: 'architecture_daily',
    verified: true,
    avatar: 'arch',
    image: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=600&h=600&fit=crop',
    likes: 2134,
    caption: 'Modern lines 📐 #architecture #design',
    comments: 67,
    timeAgo: '1 day ago',
  },
  {
    id: '13',
    username: 'plant_parent',
    verified: false,
    avatar: 'plants',
    image: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=600&h=600&fit=crop',
    likes: 1893,
    caption: 'Green therapy 🌿 #plants #homedecor',
    comments: 89,
    timeAgo: '1 day ago',
  },
  {
    id: '14',
    username: 'ocean_vibes',
    verified: true,
    avatar: 'ocean',
    image: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=600&h=600&fit=crop',
    likes: 5234,
    caption: 'Ocean state of mind 🌊 #ocean #waves',
    comments: 201,
    timeAgo: '1 day ago',
  },
  {
    id: '15',
    username: 'vintage_finds',
    verified: false,
    avatar: 'vintage',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop',
    likes: 1456,
    caption: 'Vintage treasures 📷 #vintage #retro',
    comments: 54,
    timeAgo: '1 day ago',
  },
  {
    id: '16',
    username: 'night_owl',
    verified: true,
    avatar: 'night',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=600&fit=crop',
    likes: 7821,
    caption: 'Starry nights ⭐ #nightsky #stars',
    comments: 312,
    timeAgo: '2 days ago',
  },
  {
    id: '17',
    username: 'dessert_dreams',
    verified: false,
    avatar: 'dessert',
    image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&h=600&fit=crop',
    likes: 3456,
    caption: 'Sweet treats 🍩 #dessert #foodporn',
    comments: 145,
    timeAgo: '2 days ago',
  },
  {
    id: '18',
    username: 'adventure_time',
    verified: true,
    avatar: 'adventure',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&h=600&fit=crop',
    likes: 4567,
    caption: 'Adventure awaits 🏔️ #hiking #adventure',
    comments: 178,
    timeAgo: '2 days ago',
  },
  {
    id: '19',
    username: 'book_worm',
    verified: false,
    avatar: 'books',
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=600&fit=crop',
    likes: 1234,
    caption: 'Lost in pages 📚 #books #reading',
    comments: 67,
    timeAgo: '2 days ago',
  },
  {
    id: '20',
    username: 'fashion_forward',
    verified: true,
    avatar: 'fashion',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=600&fit=crop',
    likes: 5678,
    caption: 'Style is a way of saying who you are 👗 #fashion #ootd',
    comments: 234,
    timeAgo: '2 days ago',
  },
  {
    id: '21',
    username: 'car_enthusiast',
    verified: false,
    avatar: 'cars',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&h=600&fit=crop',
    likes: 4321,
    caption: 'Dream machine 🚗 #cars #luxury',
    comments: 189,
    timeAgo: '3 days ago',
  },
  {
    id: '22',
    username: 'minimalist_life',
    verified: true,
    avatar: 'minimal',
    image: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=600&h=600&fit=crop',
    likes: 2345,
    caption: 'Less is more ⚪ #minimalism #simple',
    comments: 78,
    timeAgo: '3 days ago',
  },
  {
    id: '23',
    username: 'wildlife_watch',
    verified: true,
    avatar: 'wildlife',
    image: 'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=600&h=600&fit=crop',
    likes: 6543,
    caption: 'Wild and free 🦁 #wildlife #nature',
    comments: 267,
    timeAgo: '3 days ago',
  },
  {
    id: '24',
    username: 'music_lover',
    verified: false,
    avatar: 'music',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&h=600&fit=crop',
    likes: 2876,
    caption: 'Feel the rhythm 🎵 #music #vibes',
    comments: 112,
    timeAgo: '3 days ago',
  },
  {
    id: '25',
    username: 'garden_goals',
    verified: false,
    avatar: 'garden',
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=600&fit=crop',
    likes: 1987,
    caption: 'Bloom where you are planted 🌸 #garden #flowers',
    comments: 89,
    timeAgo: '3 days ago',
  },
  {
    id: '26',
    username: 'tech_geek',
    verified: true,
    avatar: 'tech',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=600&fit=crop',
    likes: 3654,
    caption: 'Future is now 🤖 #tech #innovation',
    comments: 145,
    timeAgo: '4 days ago',
  },
  {
    id: '27',
    username: 'yoga_daily',
    verified: true,
    avatar: 'yoga',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=600&fit=crop',
    likes: 4123,
    caption: 'Find your balance 🧘 #yoga #wellness',
    comments: 178,
    timeAgo: '4 days ago',
  },
  {
    id: '28',
    username: 'space_explorer',
    verified: false,
    avatar: 'space',
    image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&h=600&fit=crop',
    likes: 8765,
    caption: 'To infinity and beyond 🚀 #space #cosmos',
    comments: 432,
    timeAgo: '4 days ago',
  },
  {
    id: '29',
    username: 'rain_aesthetic',
    verified: false,
    avatar: 'rain',
    image: 'https://images.unsplash.com/photo-1428592953211-077101b2021b?w=600&h=600&fit=crop',
    likes: 2543,
    caption: 'Dancing in the rain ☔ #rain #mood',
    comments: 98,
    timeAgo: '4 days ago',
  },
  {
    id: '30',
    username: 'cat_lovers',
    verified: true,
    avatar: 'cats',
    image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=600&fit=crop',
    likes: 9876,
    caption: 'Purrfect companion 🐱 #cats #catlover',
    comments: 567,
    timeAgo: '5 days ago',
  },
  {
    id: '31',
    username: 'waterfall_wonder',
    verified: false,
    avatar: 'waterfall',
    image: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=600&h=600&fit=crop',
    likes: 5432,
    caption: 'Chasing waterfalls 💧 #waterfall #nature',
    comments: 213,
    timeAgo: '5 days ago',
  },
  {
    id: '32',
    username: 'neon_nights',
    verified: true,
    avatar: 'neon',
    image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&h=600&fit=crop',
    likes: 4321,
    caption: 'Neon dreams 💜 #neon #nightlife',
    comments: 176,
    timeAgo: '5 days ago',
  },
  {
    id: '33',
    username: 'autumn_vibes',
    verified: false,
    avatar: 'autumn',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop',
    likes: 3876,
    caption: 'Fall in love with autumn 🍂 #autumn #fall',
    comments: 154,
    timeAgo: '5 days ago',
  },
  {
    id: '34',
    username: 'drone_shots',
    verified: true,
    avatar: 'drone',
    image: 'https://images.unsplash.com/photo-1473773508845-188df298d2d1?w=600&h=600&fit=crop',
    likes: 6789,
    caption: 'View from above 🚁 #drone #aerial',
    comments: 289,
    timeAgo: '6 days ago',
  },
  {
    id: '35',
    username: 'breakfast_club',
    verified: false,
    avatar: 'breakfast',
    image: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=600&h=600&fit=crop',
    likes: 2345,
    caption: 'Rise and shine ☀️ #breakfast #morning',
    comments: 98,
    timeAgo: '6 days ago',
  },
  {
    id: '36',
    username: 'snow_adventure',
    verified: true,
    avatar: 'snow',
    image: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=600&h=600&fit=crop',
    likes: 5678,
    caption: 'Winter wonderland ❄️ #snow #winter',
    comments: 234,
    timeAgo: '6 days ago',
  },
  {
    id: '37',
    username: 'portrait_pro',
    verified: true,
    avatar: 'portrait',
    image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=600&fit=crop',
    likes: 7654,
    caption: 'Capturing souls 📸 #portrait #photography',
    comments: 321,
    timeAgo: '1 week ago',
  },
  {
    id: '38',
    username: 'bike_life',
    verified: false,
    avatar: 'bike',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop',
    likes: 3456,
    caption: 'Two wheels, one passion 🏍️ #motorcycle #bikelife',
    comments: 145,
    timeAgo: '1 week ago',
  },
  {
    id: '39',
    username: 'crystal_clear',
    verified: false,
    avatar: 'crystal',
    image: 'https://images.unsplash.com/photo-1509281373149-e957c6296406?w=600&h=600&fit=crop',
    likes: 2134,
    caption: 'Crystal vibes ✨ #crystals #healing',
    comments: 87,
    timeAgo: '1 week ago',
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
              <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-zinc-400 hover:text-white">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700">
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Flag className="w-4 h-4" />
                  Report
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <Ban className="w-4 h-4" />
                  Block Creator
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                  <EyeOff className="w-4 h-4" />
                  See Less Like This
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-white hover:text-zinc-400 transition-colors">
                      <Share2 className="w-6 h-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-zinc-800 border-zinc-700">
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Repeat2 className="w-4 h-4" />
                      Repost
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Send className="w-4 h-4" />
                      DM to
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-white hover:bg-zinc-700 cursor-pointer gap-2">
                      <Link className="w-4 h-4" />
                      Copy URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

// Shuffle array based on seed
function shuffleArray<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  let randomValue = seed;

  while (currentIndex !== 0) {
    randomValue = (randomValue * 9301 + 49297) % 233280;
    const randomIndex = Math.floor((randomValue / 233280) * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
}

export function ImagesFeed({ showCollage = false, isRefreshing = false, refreshKey = 0 }: ImagesFeedProps) {
  const hasAnimated = useRef(false);
  
  // Shuffle posts based on refreshKey
  const shuffledPosts = useMemo(() => {
    return shuffleArray(MOCK_POSTS, refreshKey);
  }, [refreshKey]);
  
  // Only animate after first render (when switching views)
  const shouldAnimate = hasAnimated.current;
  hasAnimated.current = true;

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {showCollage ? (
        <motion.div
          key={`collage-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CollageView posts={shuffledPosts} />
        </motion.div>
      ) : (
        <motion.div
          key={`endless-${refreshKey}`}
          initial={shouldAnimate ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <EndlessScrollView posts={shuffledPosts} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}