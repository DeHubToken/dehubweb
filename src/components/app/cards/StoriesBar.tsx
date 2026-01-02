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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';

interface StoriesBarProps {
  /** Array of user seeds for generating story avatars */
  users: string[];
}

export function StoriesBar({ users }: StoriesBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleGoLive = () => {
    setIsOpen(false);
    // TODO: Implement live streaming
  };

  const handleAddStory = () => {
    setIsOpen(false);
    // TODO: Implement story creation
  };

  const menuContent = (
    <div className="space-y-1">
      <button
        onClick={handleGoLive}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
          <Video className="w-4 h-4 text-red-500" />
        </div>
        <span className="text-white font-medium">Go Live</span>
      </button>
      <button
        onClick={handleAddStory}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
          <Image className="w-4 h-4 text-orange-500" />
        </div>
        <span className="text-white font-medium">Add Story</span>
      </button>
    </div>
  );

  const triggerButton = (
    <div className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer">
      <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
        <div className="p-0.5 bg-zinc-900 rounded-full">
          <div className="w-14 h-14 rounded-full bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center">
            <Plus className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
      <span className="text-xs text-zinc-400 truncate w-16 text-center">Live/Story</span>
    </div>
  );

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 -mt-[7px]">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide">
        {/* Create Story/Live Button */}
        {isMobile ? (
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
        ) : (
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              {triggerButton}
            </DropdownMenuTrigger>
            <DropdownMenuContent glass className="w-48 p-2" align="start" sideOffset={8}>
              {menuContent}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User Stories */}
        {users.map((name) => (
          <div key={name} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="p-0.5 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-orange-500">
              <div className="p-0.5 bg-zinc-900 rounded-full">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} />
                  <AvatarFallback className="bg-zinc-700">{name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <span className="text-xs text-zinc-400 truncate w-16 text-center">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
