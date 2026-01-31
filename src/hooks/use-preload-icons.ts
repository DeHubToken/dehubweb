import { useEffect } from 'react';

// Import all 3D icons to preload them
import aiStarIcon from '@/assets/icons/ai-star-icon.png';
import bookmarkIcon from '@/assets/icons/bookmark-icon.png';
import chatBubbleIcon from '@/assets/icons/chat-bubble.png';
import messagesIcon from '@/assets/icons/messages-icon.png';
import notificationsIcon from '@/assets/icons/notifications-icon.png';
import settingsIcon from '@/assets/icons/settings-icon.png';

// List of all 3D icons that need to be preloaded
const icons = [
  aiStarIcon,
  bookmarkIcon,
  chatBubbleIcon,
  messagesIcon,
  notificationsIcon,
  settingsIcon,
];

let preloaded = false;

export function usePreloadIcons() {
  useEffect(() => {
    if (preloaded) return;
    
    // Preload all icons by creating Image objects
    icons.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    
    preloaded = true;
  }, []);
}

// Export icon paths for consistent usage across components
export {
  aiStarIcon,
  bookmarkIcon,
  chatBubbleIcon,
  messagesIcon,
  notificationsIcon,
  settingsIcon,
};
