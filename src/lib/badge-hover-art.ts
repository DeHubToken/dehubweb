import { badgePosterBounds as posterBounds } from './badge-poster-bounds';
const posters = import.meta.glob<string>('../assets/badges/hover/*.png', { eager: true, import: 'default' });
const animations = import.meta.glob<string>('../assets/badges/hover/*.webp', { eager: true, import: 'default' });

export function badgeHoverArt(tier: string | null | undefined) {
  if (!tier || !posterBounds[tier]) return null;
  const slug = tier.toLowerCase().replace(/ /g, '-');
  return {
    poster: posters['../assets/badges/hover/' + slug + '.png'],
    animation: animations['../assets/badges/hover/' + slug + '-animation.webp'],
    posterBounds: { left: posterBounds[tier][0], top: posterBounds[tier][1], right: posterBounds[tier][2], bottom: posterBounds[tier][3] },
  };
}
