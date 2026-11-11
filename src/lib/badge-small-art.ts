// Name-badge stills already shrunk for the size they are drawn at (about 18px
// tall): 32, 64 and 96px for 1x, 2x and 3x screens, built from the 128px
// masters by scripts/build-badge-small.py. Shrinking the master on the fly left
// ragged edges, and each of these is a fraction of the master's weight.
const small = import.meta.glob<string>('../assets/badges/small/*.webp', { eager: true, import: 'default' });

const sets = new Map<string, string | undefined>();

/** `srcset` for a tier's small still, or undefined when the tier has none. */
export function badgeSmallSrcSet(tier: string | null | undefined): string | undefined {
  if (!tier) return undefined;
  if (sets.has(tier)) return sets.get(tier);
  const base = '../assets/badges/small/' + tier.toLowerCase().replace(/ /g, '-');
  const [x1, x2, x3] = [small[base + '.webp'], small[base + '-2x.webp'], small[base + '-3x.webp']];
  const set = x1 && x2 && x3 ? `${x1} 1x, ${x2} 2x, ${x3} 3x` : undefined;
  sets.set(tier, set);
  return set;
}

let warmed = false;
const kept: HTMLImageElement[] = [];

/**
 * Fetches every tier's small still for this screen once the page has settled,
 * so a badge that first appears further down a feed, in a chat or on a
 * leaderboard is already here. Thirteen files, a few KB each.
 */
export function warmBadgeStills(): void {
  if (warmed || typeof window === 'undefined' || typeof Image === 'undefined') return;
  warmed = true;
  window.setTimeout(() => {
    const tiers = new Set(Object.keys(small).map((path) => path.split('/').pop()!.replace(/(-\dx)?\.webp$/, '')));
    for (const slug of tiers) {
      const base = '../assets/badges/small/' + slug;
      const image = new Image();
      image.decoding = 'async';
      image.srcset = `${small[base + '.webp']} 1x, ${small[base + '-2x.webp']} 2x, ${small[base + '-3x.webp']} 3x`;
      kept.push(image);
    }
  }, 2500);
}
