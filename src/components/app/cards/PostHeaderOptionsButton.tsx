import type { ButtonHTMLAttributes } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

type PostHeaderOptionsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  iconSize?: number;
};

/** Align the visible dots with the content edge, retaining a 44px tap target. */
export function PostHeaderOptionsButton({
  iconSize = 23.5,
  className,
  style,
  ...props
}: PostHeaderOptionsButtonProps) {
  const padding = (44 - iconSize) / 2;
  return (
    <button
      type="button"
      aria-label="Post options"
      {...props}
      className={cn('relative flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-white transition-colors', className)}
      style={{ margin: -padding, ...style }}
    >
      <MoreVertical
        style={{
          width: iconSize,
          height: iconSize,
          // The stroked dots end at x=14 on Lucide's 24-unit grid.
          transform: `translateX(${iconSize * (10 / 24)}px)`,
        }}
      />
    </button>
  );
}
