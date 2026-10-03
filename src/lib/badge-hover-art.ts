const posters = import.meta.glob<string>('../assets/badges/hover/*.png', { eager: true, import: 'default' });
const animations = import.meta.glob<string>('../assets/badges/hover/*.webp', { eager: true, import: 'default' });

const bounds: Record<string, [number, number, number, number]> = {
  'Crab': [9, 10, 119, 119],
  'Ghost Lobster': [3, 11, 126, 119],
  'Piranha': [5, 11, 122, 126],
  'Giant Tortoise': [11, 11, 122, 112],
  'King Cobra': [15, 7, 117, 124],
  'Octopus': [12, 15, 122, 124],
  'Crocodile': [7, 7, 121, 123],
  'Dolphin': [15, 0, 125, 126],
  'Tiger Shark': [6, 12, 122, 121],
  'Great White Shark': [4, 6, 122, 121],
  'Killer Whale': [4, 4, 125, 125],
  'Blue Whale': [0, 0, 128, 128],
  'Megalodon': [2, 8, 126, 128],
};

export function badgeHoverArt(tier: string | null | undefined) {
  if (!tier || !bounds[tier]) return null;
  const slug = tier.toLowerCase().replaceAll(' ', '-');
  const [left, top, right, bottom] = bounds[tier];
  return {
    poster: posters['../assets/badges/hover/' + slug + '.png'],
    animation: animations['../assets/badges/hover/' + slug + '.webp'],
    bounds: { left, top, right, bottom },
  };
}
