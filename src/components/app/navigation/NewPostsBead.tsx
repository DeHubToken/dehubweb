import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NewPostAuthor } from '@/hooks/use-unified-feed';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const FACE = 22;
const FACE_OVERLAP = 7;

/** "N new" with up to three faces: a small glass capsule floating just under
 *  the phone nav. Its slot clips at the nav's bottom edge, so when the nav
 *  hides (html[data-nav-hidden]) the chip slips up behind it first, and drops
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
      initial={{ y: -46, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -46, opacity: 0, scale: 0.8, pointerEvents: 'none' }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 30, mass: 0.7 }}
      className="pointer-events-none flex justify-center pt-2"
    >
      <button
        type="button"
        data-feed-new-posts-chip
        onClick={onShow}
        className="pointer-events-auto flex h-[34px] items-center whitespace-nowrap gap-2 pl-1.5 pr-3 text-[13px] font-semibold tabular-nums"
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
        <ArrowUp aria-hidden="true" className="h-3.5 w-3.5 opacity-80" strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}
