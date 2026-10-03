import poster0 from '@/assets/badges/hover/crab.png';
import animation0 from '@/assets/badges/hover/crab.webp';
import poster1 from '@/assets/badges/hover/ghost-lobster.png';
import animation1 from '@/assets/badges/hover/ghost-lobster.webp';
import poster2 from '@/assets/badges/hover/piranha.png';
import animation2 from '@/assets/badges/hover/piranha.webp';
import poster3 from '@/assets/badges/hover/giant-tortoise.png';
import animation3 from '@/assets/badges/hover/giant-tortoise.webp';
import poster4 from '@/assets/badges/hover/king-cobra.png';
import animation4 from '@/assets/badges/hover/king-cobra.webp';
import poster5 from '@/assets/badges/hover/octopus.png';
import animation5 from '@/assets/badges/hover/octopus.webp';
import poster6 from '@/assets/badges/hover/crocodile.png';
import animation6 from '@/assets/badges/hover/crocodile.webp';
import poster7 from '@/assets/badges/hover/dolphin.png';
import animation7 from '@/assets/badges/hover/dolphin.webp';
import poster8 from '@/assets/badges/hover/tiger-shark.png';
import animation8 from '@/assets/badges/hover/tiger-shark.webp';
import poster9 from '@/assets/badges/hover/great-white-shark.png';
import animation9 from '@/assets/badges/hover/great-white-shark.webp';
import poster10 from '@/assets/badges/hover/killer-whale.png';
import animation10 from '@/assets/badges/hover/killer-whale.webp';
import poster11 from '@/assets/badges/hover/blue-whale.png';
import animation11 from '@/assets/badges/hover/blue-whale.webp';
import poster12 from '@/assets/badges/hover/megalodon.png';
import animation12 from '@/assets/badges/hover/megalodon.webp';

interface BadgeHoverArt {
  poster: string;
  animation: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

const artwork: Record<string, BadgeHoverArt> = {
  "Crab": { poster: poster0, animation: animation0, bounds: {"left":9,"top":10,"right":119,"bottom":119} },
  "Ghost Lobster": { poster: poster1, animation: animation1, bounds: {"left":3,"top":11,"right":126,"bottom":119} },
  "Piranha": { poster: poster2, animation: animation2, bounds: {"left":5,"top":11,"right":122,"bottom":126} },
  "Giant Tortoise": { poster: poster3, animation: animation3, bounds: {"left":11,"top":11,"right":122,"bottom":112} },
  "King Cobra": { poster: poster4, animation: animation4, bounds: {"left":15,"top":7,"right":117,"bottom":124} },
  "Octopus": { poster: poster5, animation: animation5, bounds: {"left":12,"top":15,"right":122,"bottom":124} },
  "Crocodile": { poster: poster6, animation: animation6, bounds: {"left":7,"top":7,"right":121,"bottom":123} },
  "Dolphin": { poster: poster7, animation: animation7, bounds: {"left":15,"top":0,"right":125,"bottom":126} },
  "Tiger Shark": { poster: poster8, animation: animation8, bounds: {"left":6,"top":12,"right":122,"bottom":121} },
  "Great White Shark": { poster: poster9, animation: animation9, bounds: {"left":4,"top":6,"right":122,"bottom":121} },
  "Killer Whale": { poster: poster10, animation: animation10, bounds: {"left":4,"top":4,"right":125,"bottom":125} },
  "Blue Whale": { poster: poster11, animation: animation11, bounds: {"left":0,"top":0,"right":128,"bottom":128} },
  "Megalodon": { poster: poster12, animation: animation12, bounds: {"left":2,"top":8,"right":126,"bottom":128} },
};

export function badgeHoverArt(tier: string | null | undefined): BadgeHoverArt | null {
  return tier ? artwork[tier] ?? null : null;
}
