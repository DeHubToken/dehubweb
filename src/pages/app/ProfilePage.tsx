import { useState } from 'react';
import { 
  Home, Link2, MessageCircle, Image, Video, Star, Play, Radio,
  Calendar, Heart, Share, UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/PageHeader';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { cn } from '@/lib/utils';

const PROFILE_TABS = [
  { icon: Home, label: 'Posts', value: 'posts', count: 142 },
  { icon: Link2, label: 'Links', value: 'links', count: 0 },
  { icon: MessageCircle, label: 'Replies', value: 'replies', count: 28 },
  { icon: Image, label: 'Images', value: 'images', count: 30 },
  { icon: Video, label: 'Videos', value: 'videos', count: 18 },
  { icon: Star, label: 'Favorites', value: 'favorites', count: 12 },
  { icon: Play, label: 'Clips', value: 'clips', count: 16 },
  { icon: Radio, label: 'Live', value: 'live', count: 5 },
];

const MOCK_PROFILE = {
  name: 'Alice Cooper',
  handle: '@alice_cooper',
  verified: true,
  bio: 'Tech enthusiast & startup founder 🚀 Building the future one line of code at a time. Always exploring new technologies!',
  joinedDate: 'January 2024',
  following: 416,
  followers: 1825,
  postsCount: 142,
};

const MOCK_POST = {
  id: '1',
  author: MOCK_PROFILE,
  content: 'Just finished an amazing workout session! Feeling stronger every day 💪',
  createdAt: '2h',
  category: 'Thought',
  pinned: true,
  stats: { likes: 234, comments: 12, shares: 5 },
};

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('posts');

  return (
    <div className="min-h-screen">

      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 mt-2 lg:mt-0">
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Cover Photo */}
          <div className="h-28 sm:h-36 bg-gradient-to-br from-purple-900/50 via-zinc-800 to-blue-900/50" />
          
          {/* Profile Content */}
          <div className="px-4 sm:px-6 pb-4">
            {/* Avatar - positioned to overlap banner */}
            <div className="relative -mt-12 sm:-mt-14 mb-4">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-900 p-1">
                <UserAvatar 
                  name={MOCK_PROFILE.name} 
                  handle={MOCK_PROFILE.handle} 
                  size="lg" 
                  className="w-full h-full rounded-full"
                />
              </div>
              <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-500 rounded-full border-2 border-zinc-900" />
            </div>

            {/* Action Buttons - separate row */}
            <div className="flex items-center gap-2 mb-4">
              <Button 
                size="sm" 
                className="rounded-full bg-white text-black hover:bg-zinc-200 gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Follow
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Message
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-9 w-9"
              >
                <Share className="w-4 h-4" />
              </Button>
            </div>

            {/* Profile Info */}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{MOCK_PROFILE.name}</h2>
                {MOCK_PROFILE.verified && <VerifiedBadge className="w-5 h-5" />}
              </div>
              <p className="text-zinc-500">{MOCK_PROFILE.handle}</p>
              
              <p className="mt-3 text-white/90 text-sm sm:text-base">{MOCK_PROFILE.bio}</p>
              
              <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
                <Calendar className="w-4 h-4" />
                <span>Joined {MOCK_PROFILE.joinedDate}</span>
              </div>
              
              <div className="flex items-center gap-4 mt-3">
                <button className="hover:underline">
                  <span className="font-bold text-white">{MOCK_PROFILE.following}</span>
                  <span className="text-zinc-500 ml-1">Following</span>
                </button>
                <button className="hover:underline">
                  <span className="font-bold text-white">{MOCK_PROFILE.followers}</span>
                  <span className="text-zinc-500 ml-1">Followers</span>
                </button>
              </div>
              
              <p className="text-zinc-500 text-sm mt-2">Not followed by anyone you're following</p>
            </div>
          </div>
        </div>

        {/* Profile Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex overflow-x-auto scrollbar-hide">
            {PROFILE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[60px]',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Posts Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          <article className="p-4">
            <div className="flex gap-3">
              <UserAvatar name={MOCK_POST.author.name} handle={MOCK_POST.author.handle} size="md" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{MOCK_POST.author.name}</span>
                  {MOCK_POST.author.verified && <VerifiedBadge />}
                  <span className="text-zinc-500 text-sm">{MOCK_POST.author.handle}</span>
                  <span className="text-zinc-500 text-sm">· {MOCK_POST.createdAt}</span>
                </div>
                
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-500 text-xs flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    {MOCK_POST.category}
                  </span>
                  {MOCK_POST.pinned && (
                    <span className="text-amber-500 text-xs flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      Pinned
                    </span>
                  )}
                </div>
                
                <p className="mt-2 text-white/90">{MOCK_POST.content}</p>
                
                <div className="flex items-center gap-6 mt-4 text-zinc-500">
                  <button className="flex items-center gap-2 hover:text-red-400 transition-colors">
                    <Heart className="w-5 h-5" />
                    <span className="text-sm">{MOCK_POST.stats.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-blue-400 transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm">{MOCK_POST.stats.comments}</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-green-400 transition-colors">
                    <Share className="w-5 h-5" />
                    <span className="text-sm">{MOCK_POST.stats.shares}</span>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
