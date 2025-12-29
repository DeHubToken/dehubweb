import { Heart, MessageCircle, Bookmark, Share, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
];

export function ImagesFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-3">
      {/* Posts */}
      {MOCK_POSTS.map((post) => (
        <div key={post.id} className="bg-card rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="p-0.5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500">
                <div className="p-0.5 bg-card rounded-full">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${post.avatar}`} />
                    <AvatarFallback className="bg-muted">{post.username[0]}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-foreground text-sm">{post.username}</span>
                  {post.verified && (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
            <button className="text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Image */}
          <div className="aspect-square bg-muted">
            <img src={post.image} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Actions */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <button className="text-foreground hover:text-red-400 transition-colors">
                  <Heart className="w-6 h-6" />
                </button>
                <button className="text-foreground hover:text-muted-foreground transition-colors">
                  <MessageCircle className="w-6 h-6" />
                </button>
                <button className="text-foreground hover:text-muted-foreground transition-colors">
                  <Share className="w-6 h-6" />
                </button>
              </div>
              <button className="text-foreground hover:text-muted-foreground transition-colors">
                <Bookmark className="w-6 h-6" />
              </button>
            </div>

            <p className="font-semibold text-foreground text-sm mb-1">
              {post.likes.toLocaleString()} likes
            </p>

            <p className="text-foreground text-sm">
              <span className="font-semibold">{post.username}</span>{' '}
              <span className="text-muted-foreground">{post.caption}</span>
            </p>

            <button className="text-muted-foreground text-sm mt-1">
              View all {post.comments} comments
            </button>

            <p className="text-muted-foreground text-xs mt-1">{post.timeAgo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
