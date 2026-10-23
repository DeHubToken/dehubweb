import { useTranslation as _useCopy } from 'react-i18next';
/**
 * StageCoverArt — a stage's graphic, whole, everywhere
 * ====================================================
 * Every stage surface renders its cover through this, so the listing cards,
 * the live cards and the /stages/:n page cannot drift apart again.
 *
 * The box takes the image's own shape: full width, natural height. A cover
 * that is not 16:9 is neither cropped nor letterboxed, so there is never an
 * empty band above or below it. An extremely tall upload is capped at 70vh
 * and only then filled with `cover`, so it cannot swallow the page.
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
  const { t: _copy } = _useCopy();
  return (
    <div className={cn('w-full bg-black', className)}>
      <img
        src={src}
        alt={title ? _copy("copy.99ca327a47b5", { defaultValue: "Cover graphic for {{value1}}", value1: title }) : ''}
        loading="lazy"
        className="block w-full h-auto max-h-[70vh] object-cover"
      />
    </div>
  );
}

export default StageCoverArt;
