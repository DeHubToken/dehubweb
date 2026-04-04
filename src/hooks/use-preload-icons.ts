/**
 * 3D Icon Preloader
 * =================
 * Preloads ALL 3D icon assets lazily via requestIdleCallback to avoid
 * blocking the critical rendering path. Icons are loaded after first paint.
 */

// Icon paths — imported as URL strings by Vite (tree-shaken, not bundled as binary)
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
import fractions3dIcon from '@/assets/icons/fractions-3d-icon.png';
import live3dIcon from '@/assets/icons/live-3d-icon.png';
import audio3dIcon from '@/assets/icons/audio-3d-icon.png';
import subs3dIcon from '@/assets/icons/subs-3d-icon.png';
import star3dIcon from '@/assets/icons/star-3d-icon.png';
import filmstrip3dIcon from '@/assets/icons/filmstrip-3d-icon.png';
import imageFrame3dIcon from '@/assets/icons/image-frame-3d-icon.png';
import home3dIcon from '@/assets/icons/home-3d-icon.png';
import comment3dIcon from '@/assets/icons/comment-3d-icon.png';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import trendingFireIcon from '@/assets/icons/trending-fire-icon.png';
import translateGlobeIcon from '@/assets/icons/translate-globe-icon.png';
import nailIcon from '@/assets/icons/nail-icon.png';
import lock3dIcon from '@/assets/lock-3d.png';

// Medal & badge imports kept for re-export but NOT preloaded eagerly
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';
import medal4 from '@/assets/medal-4.png';
import medal5 from '@/assets/medal-5.png';
import medal6 from '@/assets/medal-6.png';
import medal7 from '@/assets/medal-7.png';
import medal8 from '@/assets/medal-8.png';
import medal9 from '@/assets/medal-9.png';
import medal10 from '@/assets/medal-10.png';
import TortoiseBadge from '@/assets/badges/Tortoise.png';
import CrabBadge from '@/assets/badges/Crab.png';
import PiranhaBadge from '@/assets/badges/Piranha.png';
import LobsterBadge from '@/assets/badges/Lobster.png';
import OctopusBadge from '@/assets/badges/Octopus.png';
import CobraBadge from '@/assets/badges/Cobra.png';
import CrocoditeBadge from '@/assets/badges/Crocodite.png';
import DolphinBadge from '@/assets/badges/Dolphin.png';
import TigerSharkBadge from '@/assets/badges/Tiger Shark.png';
import GreatWhiteSharkBadge from '@/assets/badges/Great White Shark.png';
import KillerWhaleBadge from '@/assets/badges/Killer Whale.png';
import BlueWhaleBadge from '@/assets/badges/Blue Whale.png';
import MeglodonBadge from '@/assets/badges/Meglodon.png';
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import ethLogo from '@/assets/eth-logo.png';

// All icons to preload
const ALL_ICONS = [
  aiStarIcon, aiSparkleIcon, bookmarkIcon, bookmark3dIcon, chatBubbleIcon,
  messagesIcon, messages3dIcon, messagesBubbleIcon, notificationsIcon,
  settingsIcon, searchIcon, search3dIcon, fractions3dIcon, live3dIcon,
  audio3dIcon, subs3dIcon, star3dIcon, filmstrip3dIcon, imageFrame3dIcon,
  home3dIcon, comment3dIcon, stagesMicIcon, trendingFireIcon,
  translateGlobeIcon, nailIcon, lock3dIcon,
  medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10,
  TortoiseBadge, CrabBadge, PiranhaBadge, LobsterBadge, OctopusBadge,
  CobraBadge, CrocoditeBadge, DolphinBadge, TigerSharkBadge,
  GreatWhiteSharkBadge, KillerWhaleBadge, BlueWhaleBadge, MeglodonBadge,
  dehubCoin, bnbLogo, usdtLogo, ethLogo,
];

// ── DEFERRED PRELOAD — runs after first paint via requestIdleCallback ──
let preloaded = false;
function preloadAllIcons() {
  if (preloaded) return;
  preloaded = true;
  ALL_ICONS.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

if (typeof window !== 'undefined') {
  const schedule = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1500);
  schedule(preloadAllIcons);
}

/** Hook kept for backwards compatibility — no-op. */
export function usePreloadIcons() {}

export {
  aiStarIcon, aiSparkleIcon, bookmarkIcon, bookmark3dIcon, chatBubbleIcon,
  messagesIcon, messages3dIcon, messagesBubbleIcon, notificationsIcon,
  settingsIcon, searchIcon, search3dIcon, fractions3dIcon, live3dIcon,
  audio3dIcon, subs3dIcon, star3dIcon, filmstrip3dIcon, imageFrame3dIcon,
  home3dIcon, comment3dIcon, stagesMicIcon, trendingFireIcon,
  translateGlobeIcon, nailIcon, lock3dIcon,
};
