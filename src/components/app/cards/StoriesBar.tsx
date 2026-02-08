/**
 * Stories Bar Component
 * =====================
 * Horizontal scrollable bar displaying user stories with create story/live option.
 * Stories are uploaded to storage and expire after 24 hours.
 */

import { useState } from 'react';
import { Plus, Video, Mic, Camera, PenSquare } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { StoriesBarSkeleton } from '@/components/app/feeds/FeedSkeletons';
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
import { ShortsViewer } from '@/components/app/cards/ShortsViewer';
import { PostModal } from '@/features/post';
import { useStories, useUploadStory, type Story } from '@/hooks/use-stories';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';

interface StoryUser {
  name: string;
  avatar: string;
  hasStory?: boolean;
}

interface StoriesBarProps {
  users: StoryUser[];
  isLoading?: boolean;
  /** Shorts data for transitioning when stories end */
  shorts?: import('@/types/feed.types').ShortVideo[];
}

export function StoriesBar({ users, isLoading: externalLoading, shorts = [] }: StoriesBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGoLiveOpen, setIsGoLiveOpen] = useState(false);
  const [isStagesOpen, setIsStagesOpen] = useState(false);
  const [showLiveOptions, setShowLiveOptions] = useState(false);
  const [isStoryRecorderOpen, setIsStoryRecorderOpen] = useState(false);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isShortsViewerOpen, setIsShortsViewerOpen] = useState(false);
  
  const { requireAuth, AuthPromptComponent } = useAuthPrompt();
  const { walletAddress, user } = useAuth();
  const { storyUsers, stories, isLoading: storiesLoading } = useStories();
  const { uploadStory, isUploading } = useUploadStory();
  
  // Show skeleton if external loading OR stories are loading
  const showSkeleton = externalLoading || storiesLoading;

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

  const handlePostSomething = () => {
    setIsOpen(false);
    requireAuth(() => {
      setIsPostModalOpen(true);
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
        <span className="text-white font-medium">
          {isUploading ? 'Uploading...' : 'Add Story'}
        </span>
      </button>
      <button
        onClick={handlePostSomething}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <PenSquare className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Post Something</span>
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
    <div className="flex flex-col items-center gap-0.5 md:gap-1 flex-shrink-0 cursor-pointer -ml-[7.5px]">
      <div className="rounded-xl bg-gradient-to-br from-white/40 via-white/20 to-white/5 p-[2px]">
        <div className="w-[60px] h-[60px] md:w-[66px] md:h-[66px] rounded-[10px] bg-zinc-900 flex items-center justify-center">
          <Plus className="w-5 h-5 md:w-6 md:h-6 text-white" />
        </div>
      </div>
      <span className="text-[10px] md:text-xs text-zinc-400 truncate w-14 md:w-16 text-center">Create</span>
    </div>
  );

  // Combine real stories with placeholder users
  const allStoryItems = [
    ...storyUsers.map((story) => ({
      type: 'story' as const,
      story,
      name: story.username ? `@${story.username}` : `${story.wallet_address.slice(0, 6)}...`,
      avatar: buildAvatarUrl(story.wallet_address, story.avatar) || '',
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

  // Show skeleton while loading
  if (showSkeleton) {
    return <StoriesBarSkeleton />;
  }

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
        onSwitchToShorts={() => {
          // Close stories and open shorts viewer
          setIsStoryViewerOpen(false);
          if (shorts.length > 0) {
            setIsShortsViewerOpen(true);
          }
        }}
      />
      
      {/* Shorts Viewer - opens when transitioning from stories */}
      <AnimatePresence>
        {isShortsViewerOpen && shorts.length > 0 && (
          <ShortsViewer
            shorts={shorts}
            initialIndex={0}
            onClose={() => setIsShortsViewerOpen(false)}
          />
        )}
      </AnimatePresence>
      
      <PostModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
      />
      <div className="-mt-[7px]">
        <div className="relative">
          {/* Right fade gradient to signal more stories */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />
          
          <SwipeableCarousel className="flex gap-1.5 overflow-x-auto scrollbar-hide px-2">
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
                className="flex flex-col items-center gap-0.5 md:gap-1 flex-shrink-0 cursor-pointer"
                onClick={() => item.story && handleViewStory(item.story)}
              >
                {item.type === 'story' ? (
                  <div className="rounded-xl bg-gradient-to-br from-white/40 via-white/20 to-white/5 p-[2px]">
                    {/* Show thumbnail if available, otherwise avatar */}
                    {item.thumbnail ? (
                      <div className="w-[60px] h-[60px] md:w-[66px] md:h-[66px] rounded-[10px] overflow-hidden">
                        <img 
                          src={item.thumbnail} 
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <Avatar className="w-[60px] h-[60px] md:w-[66px] md:h-[66px] rounded-[10px]">
                        <AvatarImage src={item.avatar} className="object-cover rounded-[10px]" />
                        <AvatarFallback className="bg-zinc-700 rounded-[10px]">
                          {item.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ) : (
                  <Avatar className="w-[60px] h-[60px] md:w-[66px] md:h-[66px] rounded-[10px]">
                    <AvatarImage src={item.avatar} className="object-cover rounded-[10px]" />
                    <AvatarFallback className="bg-zinc-700 rounded-[10px]">
                      {item.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="text-[10px] md:text-xs text-zinc-400 truncate w-14 md:w-16 text-center">
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
