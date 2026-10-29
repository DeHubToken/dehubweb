/**
 * Thumb Icon
 * ==========
 * The plain thumbs-up (or thumbs-down) on a post, comment or Short. Your own
 * 👍 or 👎 fills it and gives it a small nod once every 5 seconds: it tips up
 * from the wrist, settles, and rests. Transform only, so it is cheap on
 * Safari. The motion lives in index.css (.dehub-thumb-nod).
 */

import ThumbsDown from '@/components/ui/cut-icons/dislike';
import ThumbsUp from '@/components/ui/cut-icons/like';
import { cn } from '@/lib/utils';

interface ThumbIconProps {
  down?: boolean;
  /** Your own vote: it nods. Fill is left to the caller's className. */
  nod?: boolean;
  className?: string;
}

export function ThumbIcon({ down = false, nod = false, className }: ThumbIconProps) {
  const Icon = down ? ThumbsDown : ThumbsUp;
  return <Icon className={cn(className, nod && 'dehub-thumb-nod', nod && down && 'dehub-thumb-nod--down')} />;
}
