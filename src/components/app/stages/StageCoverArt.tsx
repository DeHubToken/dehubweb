/**
 * StageCoverArt — a stage's graphic, whole, at one ratio everywhere
 * =================================================================
 * Every stage surface renders its cover through this, so the listing cards,
 * the live cards and the /stages/:n page cannot drift apart again.
 *
 * Two rules, and they are the whole component:
 *
 * 1. **16:9, always.** A ratio rather than a height, so it holds identically
 *    on a phone and a widescreen monitor. A height letterboxes a wide card
 *    into a strip and swallows a narrow one.
 * 2. **`contain`, never `cover`.** `cover` fills the box by cutting whatever
 *    does not fit, which silently ate the top and bottom of any cover that
 *    was not already 16:9. Containing it means a host always sees the graphic
 *    they uploaded — a non-16:9 cover is bordered, not cropped.
 *
 * The black bed is what those borders show, and it is also why the art no
 * longer sits behind the card text: a contained image has empty space in it,
 * and text over that reads as a mistake rather than a design.
 */

import { cn } from '@/lib/utils';

export function StageCoverArt({
  src,
  title,
  className,
}: {
  src: string;
  /** Used for the alt text; a cover with no stage title is decorative. */
  title?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('w-full aspect-video bg-black', className)}>
      <img
        src={src}
        alt={title ? `Cover graphic for ${title}` : ''}
        loading="lazy"
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export default StageCoverArt;
