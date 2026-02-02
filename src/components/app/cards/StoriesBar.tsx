/**
 * Stories Bar Component
 * =====================
 * Horizontal scrollable bar displaying user stories with create story/live option.
 * Stories are uploaded to storage and expire after 24 hours.
 */

import { useState } from 'react';
import { Plus, Video, Mic, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { GoLiveModal } from '@/components/app/modals';
import { AudioSpacesModal } from '@/components/app/spaces';
import { StoryRecorderModal, StoryViewerModal } from '@/components/app/stories';
import { useStories, useUploadStory, type Story } from '@/hooks/use-stories';
import { useAuth } from '@/contexts/AuthContext';

interface StoryUser {
  name: string;
  avatar: string;
  hasStory?: boolean;
}

interface StoriesBarProps {
  users: StoryUser[];
}

export function StoriesBar({ users }: StoriesBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGoLiveOpen, setIsGoLiveOpen] = useState(false);
  const [isStagesOpen, setIsStagesOpen] = useState(false);
  const [showLiveOptions, setShowLiveOptions] = useState(false);
  const [isStoryRecorderOpen, setIsStoryRecorderOpen] = useState(false);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  
  const { requireAuth, AuthPromptComponent } = useAuthPrompt();
  const { walletAddress, user } = useAuth();
  const { storyUsers, stories } = useStories();
  const { uploadStory, isUploading } = useUploadStory();

  const handleGoLiveVideo = () => {
    setShowLiveOptions(false);
    setIsOpen(false);
    requireAuth(() => {
      setIsGoLiveOpen(true);
    });
  };

  const handleGoLiveAudio = () => {
    setShowLiveOptions(false);
    setIsOpen(false);
    requireAuth(() => {
      setIsStagesOpen(true);
    });
  };

  const handleShowLiveOptions = () => {
    setIsOpen(false);
    setShowLiveOptions(true);
  };

  const handleAddStory = () => {
    setIsOpen(false);
    requireAuth(() => {
      setIsStoryRecorderOpen(true);
    });
  };

  const handleStoryRecorded = async (videoBlob: Blob) => {
    if (!walletAddress) return;
    
    await uploadStory(videoBlob, {
      walletAddress,
      username: user?.username || undefined,
      avatar: user?.avatarImageUrl || user?.avatarUrl || undefined,
    });
  };

  const handleViewStory = (story: Story) => {
    const index = stories.findIndex((s) => s.id === story.id);
    setViewerStartIndex(index >= 0 ? index : 0);
    setIsStoryViewerOpen(true);
  };

  const menuContent = (
    <div className="space-y-1">
      <button
        onClick={handleShowLiveOptions}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Video className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Go Live</span>
      </button>
      <button
        onClick={handleAddStory}
        disabled={isUploading}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left disabled:opacity-50"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Camera className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-white font-medium block">
            {isUploading ? 'Uploading...' : 'Add Story'}
          </span>
          <span className="text-zinc-400 text-xs">Record up to 30 seconds</span>
        </div>
      </button>
    </div>
  );

  const liveOptionsContent = (
    <div className="space-y-1">
      <button
        onClick={handleGoLiveVideo}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Video className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-white font-medium block">Video</span>
          <span className="text-zinc-400 text-xs">Start a livestream</span>
        </div>
      </button>
      <button
        onClick={handleGoLiveAudio}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Mic className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-white font-medium block">Audio</span>
          <span className="text-zinc-400 text-xs">Start a Stage</span>
        </div>
      </button>
    </div>
  );

  const triggerButton = (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer -ml-[7.5px]">
      <div className="p-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
        <div className="p-0.5 bg-zinc-900 rounded-xl">
          <div className="w-14 h-14 rounded-xl bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center">
            <Plus className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
      <span className="text-xs text-zinc-400 truncate w-16 text-center">Live/Story</span>
    </div>
  );

  // Combine real stories with placeholder users
  const allStoryItems = [
    ...storyUsers.map((story) => ({
      type: 'story' as const,
      story,
      name: story.username ? `@${story.username}` : `${story.wallet_address.slice(0, 6)}...`,
      avatar: story.avatar || '',
      thumbnail: story.thumbnail_url || '',
    })),
    ...users.map((user) => ({
      type: 'placeholder' as const,
      story: null as Story | null,
      name: user.name.startsWith('@') ? user.name : `@${user.name}`,
      avatar: user.avatar,
      thumbnail: '',
    })),
  ];

  return (
    <>
      <AuthPromptComponent />
      <GoLiveModal 
        isOpen={isGoLiveOpen} 
        onClose={() => setIsGoLiveOpen(false)} 
      />
      <AudioSpacesModal
        isOpen={isStagesOpen}
        onClose={() => setIsStagesOpen(false)}
      />
      <StoryRecorderModal
        isOpen={isStoryRecorderOpen}
        onClose={() => setIsStoryRecorderOpen(false)}
        onStoryRecorded={handleStoryRecorded}
      />
      <StoryViewerModal
        isOpen={isStoryViewerOpen}
        onClose={() => setIsStoryViewerOpen(false)}
        stories={stories}
        initialIndex={viewerStartIndex}
      />
      <div className="bg-zinc-900 rounded-2xl p-4 -mt-[7px]">
        <div className="relative">
          {/* Right fade only */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-[1]" />
          
          <SwipeableCarousel className="flex gap-4 overflow-x-auto scrollbar-hide px-2">
            {/* Create Story/Live Button */}
            <Drawer open={isOpen} onOpenChange={setIsOpen}>
              <div onClick={() => setIsOpen(true)}>
                {triggerButton}
              </div>
              <DrawerContent glass className="px-4 pb-8" hideHandle>
                <DrawerHeader className="mb-2">
                  <DrawerTitle className="text-white">Create</DrawerTitle>
                </DrawerHeader>
                {menuContent}
              </DrawerContent>
            </Drawer>

            {/* Live Options Drawer */}
            <Drawer open={showLiveOptions} onOpenChange={setShowLiveOptions}>
              <DrawerContent glass className="px-4 pb-8" hideHandle>
                <DrawerHeader className="mb-2">
                  <DrawerTitle className="text-white">Go Live</DrawerTitle>
                </DrawerHeader>
                {liveOptionsContent}
              </DrawerContent>
            </Drawer>

            {/* Stories - Real and Placeholder */}
            {allStoryItems.map((item, index) => (
              <div
                key={item.type === 'story' ? item.story?.id : `placeholder-${index}`}
                className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer"
                onClick={() => item.story && handleViewStory(item.story)}
              >
                {item.type === 'story' ? (
                  <div className="p-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
                    {/* Show thumbnail if available, otherwise avatar */}
                    {item.thumbnail ? (
                      <div className="w-14 h-14 rounded-lg overflow-hidden">
                        <img 
                          src={item.thumbnail} 
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <Avatar className="w-14 h-14 rounded-lg">
                        <AvatarImage src={item.avatar} className="object-cover rounded-lg" />
                        <AvatarFallback className="bg-zinc-700 rounded-lg">
                          {item.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ) : (
                  <Avatar className="w-14 h-14">
                    <AvatarImage src={item.avatar} className="object-cover" />
                    <AvatarFallback className="bg-zinc-700">
                      {item.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="text-xs text-zinc-400 truncate w-16 text-center">
                  {item.name}
                </span>
              </div>
            ))}
          </SwipeableCarousel>
        </div>
      </div>
    </>
  );
}
