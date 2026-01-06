import { useState } from 'react';
import { 
  Home, Link2, MessageCircle, Image, Video, Star, Play, Radio,
  Calendar, Heart, Share, UserPlus, Copy, AtSign, Wallet, Send, Plus, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/UserAvatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { cn } from '@/lib/utils';
import { useIsTouchDevice } from '@/hooks/use-touch-device';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  const handleCopyProfileUrl = () => {
    navigator.clipboard.writeText(`https://dehub.gg/${MOCK_PROFILE.handle.replace('@', '')}`);
    toast.success('Profile URL copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(MOCK_PROFILE.handle);
    toast.success('Username copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText('0x1234...5678'); // Mock wallet address
    toast.success('Address copied to clipboard');
    setShareSheetOpen(false);
  };

  const handleSendCoins = () => {
    toast.info('Send coins feature coming soon');
    setShareSheetOpen(false);
  };

  const handleToggleNotifications = () => {
    toast.success('Notifications enabled for this profile');
    setShareSheetOpen(false);
  };

  const ShareOptions = () => (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleCopyProfileUrl}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Copy className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy profile URL</span>
      </button>
      <button
        onClick={handleCopyUsername}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <AtSign className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy username</span>
      </button>
      <button
        onClick={handleCopyAddress}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Copy address</span>
      </button>
      <button
        onClick={handleSendCoins}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Send className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Send coins</span>
      </button>
      <button
        onClick={handleToggleNotifications}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Bell className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Notify</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen">

      <div className="p-2 sm:p-3 space-y-2 sm:space-y-3 mt-2 lg:mt-0">
        {/* Profile Card Bento */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden">
          {/* Cover Photo */}
          <div className="aspect-[3/1] bg-gradient-to-br from-purple-900/50 via-zinc-800 to-blue-900/50" />
          
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
              {isTouchDevice ? (
                <Sheet open={shareSheetOpen} onOpenChange={setShareSheetOpen}>
                  <SheetTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-9 w-9"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent 
                    side="bottom" 
                    className="bg-zinc-900/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl"
                  >
                    <ShareOptions />
                  </SheetContent>
                </Sheet>
              ) : (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent h-9 w-9"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="end" 
                    className="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-xl min-w-[220px] p-1"
                  >
                    <DropdownMenuItem 
                      onClick={handleCopyProfileUrl}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 focus:bg-white/10 cursor-pointer mb-1"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                        <Copy className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Copy profile URL</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleCopyUsername}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 focus:bg-white/10 cursor-pointer mb-1"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                        <AtSign className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Copy username</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleCopyAddress}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 focus:bg-white/10 cursor-pointer mb-1"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Copy address</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleSendCoins}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 focus:bg-white/10 cursor-pointer mb-1"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                        <Send className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Send coins</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleToggleNotifications}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 focus:bg-white/10 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                        <Bell className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-white font-medium text-sm">Notify</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
        <div className="bg-zinc-900 rounded-2xl p-2 relative">
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
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none rounded-r-2xl" />
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
