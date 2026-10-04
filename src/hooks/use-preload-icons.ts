/**
 * 3D Icon Preloader
 * =================
 * Preloads the shared 3D assets at module-load time and the selected theme's
 * custom WebPs after that theme resolves. This eliminates page-to-page icon
 * flicker without downloading all six material sets up front.
 * 
 * Icons are preloaded immediately when this module is first imported (in App.tsx),
 * NOT inside useEffect, so they're cached by the browser before any page renders.
 */
import { useEffect } from 'react';
import { useAppTheme } from '@/contexts/ThemeContext';

// ── Page header icons ──
import aiStarIcon from '@/assets/icons/ai-star-icon.png';
import aiSparkleIcon from '@/assets/icons/ai-sparkle-icon.png';
import bookmarkIcon from '@/assets/icons/bookmark-icon.webp';
import bookmark3dIcon from '@/assets/icons/bookmark-3d-icon.webp';
import chatBubbleIcon from '@/assets/icons/chat-bubble.webp';
import messagesIcon from '@/assets/icons/messages-icon.webp';
import messages3dIcon from '@/assets/icons/messages-3d-icon.webp';
import messagesBubbleIcon from '@/assets/icons/messages-bubble-icon.png';
import notificationsIcon from '@/assets/icons/notifications-icon.webp';
import settingsIcon from '@/assets/icons/settings-icon.webp';
import searchIcon from '@/assets/icons/search-icon.png';
import search3dIcon from '@/assets/icons/search-3d-icon.webp';

// ── Profile / content empty-state icons ──
import fractions3dIcon from '@/assets/icons/fractions-3d-icon.webp';
import live3dIcon from '@/assets/icons/live-3d-icon.webp';
import audio3dIcon from '@/assets/icons/audio-3d-icon.webp';
import subs3dIcon from '@/assets/icons/subs-3d-icon.webp';
import star3dIcon from '@/assets/icons/star-3d-icon.webp';
import filmstrip3dIcon from '@/assets/icons/filmstrip-3d-icon.webp';
import imageFrame3dIcon from '@/assets/icons/image-frame-3d-icon.webp';
import home3dIcon from '@/assets/icons/home-3d-icon.webp';
import comment3dIcon from '@/assets/icons/comment-3d-icon.webp';
import communityPosts3dIcon from '@/assets/icons/community-posts-3d-icon.webp';
import communityChat3dIcon from '@/assets/icons/community-chat-3d-icon.webp';
import communityEvents3dIcon from '@/assets/icons/community-events-3d-icon.webp';
import communityMembers3dIcon from '@/assets/icons/community-members-3d-icon.webp';
import communityAbout3dIcon from '@/assets/icons/community-about-3d-icon.webp';

// ── Feature icons ──
import stagesMicIcon from '@/assets/icons/stages-mic-icon.webp';
import trendingFireIcon from '@/assets/icons/trending-fire-icon.png';
import translateGlobeIcon from '@/assets/icons/translate-globe-icon.png';
import nailIcon from '@/assets/icons/nail-icon.png';

// ── Misc assets used as icons ──
import lock3dIcon from '@/assets/lock-3d.webp';

// ── Medal assets (sidebar leaderboard) ──
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

// ── Badge assets (staking tiers) ──
import TortoiseBadge from '@/assets/badges/Giant Tortoise.webp';
import CrabBadge from '@/assets/badges/Crab.webp';
import PiranhaBadge from '@/assets/badges/Piranha.webp';
import LobsterBadge from '@/assets/badges/Ghost Lobster.webp';
import OctopusBadge from '@/assets/badges/Octopus.webp';
import CobraBadge from '@/assets/badges/King Cobra.webp';
import CrocodileBadge from '@/assets/badges/Crocodile.webp';
import DolphinBadge from '@/assets/badges/Dolphin.webp';
import TigerSharkBadge from '@/assets/badges/Tiger Shark.webp';
import GreatWhiteSharkBadge from '@/assets/badges/Great White Shark.webp';
import KillerWhaleBadge from '@/assets/badges/Killer Whale.webp';
import BlueWhaleBadge from '@/assets/badges/Blue Whale.webp';
import MegalodonBadge from '@/assets/badges/Megalodon.webp';

// ── Coin / currency logos (Command Centre wallet) ──
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import ethLogo from '@/assets/eth-logo.png';

// Critical icons needed immediately on any page — preloaded eagerly
/** Visible BrandIcon/img consumers own their artwork requests. */
export function usePreloadIcons() {}

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
