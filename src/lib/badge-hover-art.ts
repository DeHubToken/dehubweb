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

// Still pixels at alpha > 16; motion uses the full animation envelope above.
const posterBounds: Record<string, [number, number, number, number]> = {
  'Crab': [12, 21, 119, 117],
  'Ghost Lobster': [9, 13, 121, 118],
  'Piranha': [8, 16, 121, 124],
  'Giant Tortoise': [11, 17, 122, 112],
  'King Cobra': [16, 8, 117, 124],
  'Octopus': [12, 15, 122, 124],
  'Crocodile': [8, 17, 119, 123],
  'Dolphin': [19, 9, 120, 122],
  'Tiger Shark': [7, 13, 121, 121],
  'Great White Shark': [5, 15, 120, 121],
  'Killer Whale': [19, 11, 93, 98],
  'Blue Whale': [16, 24, 122, 126],
  'Megalodon': [5, 19, 124, 126],
};

export function badgeHoverArt(tier: string | null | undefined) {
  if (!tier || !bounds[tier]) return null;
  const slug = tier.toLowerCase().replace(/ /g, '-');
  const [left, top, right, bottom] = bounds[tier];
  return {
    poster: posters['../assets/badges/hover/' + slug + '.png'],
    animation: animations['../assets/badges/hover/' + slug + '-animation.webp'],
    bounds: { left, top, right, bottom },
    posterBounds: { left: posterBounds[tier][0], top: posterBounds[tier][1], right: posterBounds[tier][2], bottom: posterBounds[tier][3] },
  };
}
