import { useTranslation as _useCopy } from 'react-i18next';
/**
 * StageCoverArt — one frame for every stage cover
 * =============================================
 * Uploaded and generated artwork share a 16:9 frame across cards, carousels,
 * embeds and stage pages. Uploaded images fill it edge to edge; portrait and
 * ultrawide uploads crop from the center instead of changing the card height.
 *
 * With no uploaded cover and a `stage` passed, it draws the stage's generated
 * poster instead (GeneratedStageCover), so no stage card goes without art.
 */

import { cn } from '@/lib/utils';
import { GeneratedStageCover } from '@/components/app/stages/GeneratedStageCover';
import type { StageCoverSource } from '@/lib/stage-cover';

export function StageCoverArt({
  src,
  title,
  stage,
  className,
}: {
  src?: string | null;
  /** The stage itself; used to draw a poster when there is no `src`. */
  stage?: StageCoverSource;
  /** Used for the alt text; a cover with no stage title is decorative. */
  title?: string | null;
  className?: string;
}) {
  const { t: _copy } = _useCopy();
  if (!src) {
    return stage ? <GeneratedStageCover stage={stage} className={className} /> : null;
  }
  return (
    <div className={cn('relative w-full aspect-video overflow-hidden bg-black', className)}>
      <img
        src={src}
        alt={title ? _copy("copy.99ca327a47b5", { defaultValue: "Cover graphic for {{value1}}", value1: title }) : ''}
        loading="lazy"
        className="absolute inset-0 block h-full w-full object-cover object-center"
      />
    </div>
  );
}

export default StageCoverArt;
