/**
 * Story Emoji Picker
 * ==================
 * Fullscreen-friendly emoji picker for story overlays.
 * Bottom sheet style with category tabs.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMOJI_CATEGORIES } from './types';

interface StoryEmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
}

export function StoryEmojiPicker({ isOpen, onClose, onEmojiSelect }: StoryEmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('Smileys');

  if (!isOpen) return null;

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    onClose();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 animate-in slide-in-from-bottom duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 -top-[100vh]" 
        onClick={onClose}
      />
      
      {/* Picker panel */}
      <div className="relative bg-black/80 backdrop-blur-[24px] border-t border-white/10 rounded-t-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="text-white font-medium">Add Sticker</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex overflow-x-auto border-b border-white/10 scrollbar-hide">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category as keyof typeof EMOJI_CATEGORIES)}
              className={cn(
                'px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0',
                activeCategory === category
                  ? 'text-white border-b-2 border-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="p-4 max-h-64 overflow-y-auto">
          <div className="grid grid-cols-8 gap-2">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-white/10 rounded-lg transition-colors active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
