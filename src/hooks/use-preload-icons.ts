/**
 * 3D Icon Preloader
 * =================
 * Preloads ALL 3D icon assets at module-load time (before any component renders).
 * This eliminates the flash/flicker when navigating between pages that use these icons.
 * 
 * Icons are preloaded immediately when this module is first imported (in App.tsx),
 * NOT inside useEffect, so they're cached by the browser before any page renders.
 */

// ── Page header icons ──
import aiStarIcon from '@/assets/icons/ai-star-icon.png';
import aiSparkleIcon from '@/assets/icons/ai-sparkle-icon.png';
import bookmarkIcon from '@/assets/icons/bookmark-icon.png';
import bookmark3dIcon from '@/assets/icons/bookmark-3d-icon.png';
import chatBubbleIcon from '@/assets/icons/chat-bubble.png';
import messagesIcon from '@/assets/icons/messages-icon.png';
import messages3dIcon from '@/assets/icons/messages-3d-icon.png';
import messagesBubbleIcon from '@/assets/icons/messages-bubble-icon.png';
import notificationsIcon from '@/assets/icons/notifications-icon.png';
import settingsIcon from '@/assets/icons/settings-icon.png';
import searchIcon from '@/assets/icons/search-icon.png';
import search3dIcon from '@/assets/icons/search-3d-icon.png';

// ── Profile / content empty-state icons ──
import fractions3dIcon from '@/assets/icons/fractions-3d-icon.png';
import live3dIcon from '@/assets/icons/live-3d-icon.png';
import audio3dIcon from '@/assets/icons/audio-3d-icon.png';
import subs3dIcon from '@/assets/icons/subs-3d-icon.png';
import star3dIcon from '@/assets/icons/star-3d-icon.png';
import filmstrip3dIcon from '@/assets/icons/filmstrip-3d-icon.png';
import imageFrame3dIcon from '@/assets/icons/image-frame-3d-icon.png';
import home3dIcon from '@/assets/icons/home-3d-icon.png';
import comment3dIcon from '@/assets/icons/comment-3d-icon.png';

// ── Feature icons ──
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import trendingFireIcon from '@/assets/icons/trending-fire-icon.png';
import translateGlobeIcon from '@/assets/icons/translate-globe-icon.png';
import nailIcon from '@/assets/icons/nail-icon.png';

// ── Misc assets used as icons ──
import lock3dIcon from '@/assets/lock-3d.png';

// Complete list of all 3D/PNG icons that should be browser-cached
const ALL_ICONS = [
  aiStarIcon,
  aiSparkleIcon,
  bookmarkIcon,
  bookmark3dIcon,
  chatBubbleIcon,
  messagesIcon,
  messages3dIcon,
  messagesBubbleIcon,
  notificationsIcon,
  settingsIcon,
  searchIcon,
  search3dIcon,
  fractions3dIcon,
  live3dIcon,
  audio3dIcon,
  subs3dIcon,
  star3dIcon,
  filmstrip3dIcon,
  imageFrame3dIcon,
  home3dIcon,
  comment3dIcon,
  stagesMicIcon,
  trendingFireIcon,
  translateGlobeIcon,
  nailIcon,
  lock3dIcon,
];

// ── MODULE-LEVEL PRELOAD (runs immediately on import, before any render) ──
ALL_ICONS.forEach((src) => {
  const img = new Image();
  img.src = src;
});

/**
 * Hook kept for backwards compatibility. The actual preloading happens
 * at module level above, so this is effectively a no-op.
 */
export function usePreloadIcons() {
  // No-op: preloading already happened at module level
}

// ── Re-export all icon paths for consistent usage across components ──
export {
  aiStarIcon,
  aiSparkleIcon,
  bookmarkIcon,
  bookmark3dIcon,
  chatBubbleIcon,
  messagesIcon,
  messages3dIcon,
  messagesBubbleIcon,
  notificationsIcon,
  settingsIcon,
  searchIcon,
  search3dIcon,
  fractions3dIcon,
  live3dIcon,
  audio3dIcon,
  subs3dIcon,
  star3dIcon,
  filmstrip3dIcon,
  imageFrame3dIcon,
  home3dIcon,
  comment3dIcon,
  stagesMicIcon,
  trendingFireIcon,
  translateGlobeIcon,
  nailIcon,
  lock3dIcon,
};
