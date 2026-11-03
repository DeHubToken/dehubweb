/**
 * The strip of foil round each comic card. Absent is the theme's own foil,
 * which is how every comic looked before borders existed. The same list lives
 * in the API (src/nft/comic) and the app.
 */
export const COMIC_BORDERS = ['silver', 'bronze', 'matte-black', 'carbon-fibre', 'holographic', 'shiny', 'glitter'] as const;
export type ComicBorder = (typeof COMIC_BORDERS)[number];

/** The ones that move. They pause off screen and stop for reduced motion. */
export const ANIMATED_COMIC_BORDERS: ReadonlySet<string> = new Set(['holographic', 'glitter']);

/** i18n key under `comicBorder` for each preset. */
export const COMIC_BORDER_LABEL: Record<ComicBorder, string> = {
  silver: 'silver',
  bronze: 'bronze',
  'matte-black': 'matteBlack',
  'carbon-fibre': 'carbonFibre',
  holographic: 'holographic',
  shiny: 'shiny',
  glitter: 'glitter',
};

export function isComicBorder(value: unknown): value is ComicBorder {
  return typeof value === 'string' && (COMIC_BORDERS as readonly string[]).includes(value);
}
