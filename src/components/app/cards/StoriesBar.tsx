/**
 * Stories Bar Component
 * =====================
 * Horizontal scrollable bar displaying user stories with create story/live option.
 * 
 * @example
 * ```tsx
 * <StoriesBar users={['alice', 'bob', 'charlie']} />
 * ```
 */

import { useState } from 'react';
import { Plus, Video, Image } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useAuthPrompt } from '@/components/app/AuthPrompt';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

interface StoryUser {
  name: string;
  avatar: string;
  /** Whether this user has an active story or is live */
  hasStory?: boolean;
}

interface StoriesBarProps {
  /** Array of story users with name and avatar URL */
  users: StoryUser[];
}

export function StoriesBar({ users }: StoriesBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { requireAuth, AuthPromptComponent } = useAuthPrompt();

  const handleGoLive = () => {
    setIsOpen(false);
    requireAuth(() => {
      // TODO: Implement live streaming
    });
  };

  const handleAddStory = () => {
    setIsOpen(false);
    requireAuth(() => {
      // TODO: Implement story creation
    });
  };

  const menuContent = (
    <div className="space-y-1">
      <button
        onClick={handleGoLive}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Video className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Go Live</span>
      </button>
      <button
        onClick={handleAddStory}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <Image className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-medium">Add Story</span>
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

  return (
    <>
      <AuthPromptComponent />
      <div className="bg-zinc-900 rounded-2xl p-4 -mt-[7px]">
      <div className="relative">
        {/* Right fade only */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-[1]" />
        
        <SwipeableCarousel className="flex gap-4 overflow-x-auto scrollbar-hide px-2">
          {/* Create Story/Live Button - Always use drawer for liquid glass effect */}
          <Drawer open={isOpen} onOpenChange={setIsOpen}>
            <div onClick={() => setIsOpen(true)}>
              {triggerButton}
            </div>
            <DrawerContent glass className="px-4 pb-8">
              <DrawerHeader className="mb-2">
                <DrawerTitle className="text-white">Create</DrawerTitle>
              </DrawerHeader>
              {menuContent}
            </DrawerContent>
          </Drawer>

          {/* User Stories */}
          {users.map((user) => (
            <div key={user.name} className="flex flex-col items-center gap-1 flex-shrink-0">
              {user.hasStory !== false ? (
              <div className="p-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
                  <div className="p-0.5 bg-zinc-900 rounded-xl">
                    <Avatar className="w-14 h-14">
                      <AvatarImage src={user.avatar} className="object-cover" />
                      <AvatarFallback className="bg-zinc-700">{user.name[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </div>
                </div>
              ) : (
                <Avatar className="w-14 h-14">
                  <AvatarImage src={user.avatar} className="object-cover" />
                  <AvatarFallback className="bg-zinc-700">{user.name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              )}
              <span className="text-xs text-zinc-400 truncate w-16 text-center">{user.name}</span>
            </div>
          ))}
        </SwipeableCarousel>
      </div>
    </div>
    </>
  );
}
