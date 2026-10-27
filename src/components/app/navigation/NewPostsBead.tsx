import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { NewPostAuthor } from '@/hooks/use-unified-feed';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const FACE = 22;
const FACE_OVERLAP = 7;
/** How far the drawer's top runs up under the pill. Its slot clips at the
 *  pill's bottom edge, so this part never shows: no seam, no gap. */
const TUCK = 12;
const HEIGHT = 36;

/** "N new posts" with up to three faces: a drawer that pulls out from under
 *  the phone nav pill, in the pill's own material. The pill's own border is
 *  untouched; it casts a soft shade onto the drawer's top. When the nav hides
 *  (html[data-nav-hidden]) the drawer slides back under it first, and pulls
 *  back out after the nav returns (glass-surfaces.css). Tapping it loads the
 *  new posts. */
export function NewPostsBead({ count, authors, onShow }: {
  count: number;
  authors: NewPostAuthor[];
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const faces = authors.slice(0, 3);
  const label = t('feed.newPosts', { defaultValue: '{{count}} new posts', count });

  return (
    <motion.div
      data-feed-new-posts-chip-root
      initial={{ y: '-100%' }}
      animate={{ y: 0 }}
      exit={{ y: '-100%', pointerEvents: 'none' }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
      className="pointer-events-none flex justify-center"
    >
      <button
        type="button"
        data-feed-new-posts-chip
        onClick={onShow}
        className="pointer-events-auto flex min-w-[180px] items-end justify-center whitespace-nowrap gap-2 pl-2 pr-3.5 pb-[7px] text-[13px] font-semibold tabular-nums"
        style={{ marginTop: -TUCK, height: HEIGHT + TUCK }}
      >
        {faces.length > 0 && (
          <span className="flex">
            {faces.map((author, i) => (
              <Avatar
                key={author.address}
                data-feed-new-posts-face
                className="block shrink-0 overflow-hidden rounded-[7px]"
                style={{ width: FACE, height: FACE, marginLeft: i ? -FACE_OVERLAP : 0, zIndex: 3 - i }}
              >
                <AvatarImage src={author.avatarUrl} alt="" className="h-full w-full object-cover" />
                <AvatarFallback className="rounded-[7px] text-[10px] font-bold uppercase">{author.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
            ))}
          </span>
        )}
        <span className={faces.length ? undefined : 'pl-1.5'}>
          {label}
        </span>
      </button>
    </motion.div>
  );
}
