import { useTranslation as _useCopy } from 'react-i18next';
import type { ButtonHTMLAttributes } from 'react';
import MoreVertical from '@/components/ui/cut-icons/morevertical';
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
  const { t: _copy } = _useCopy();
  const padding = (44 - iconSize) / 2;
  return (
    <button
      type="button"
      aria-label={_copy("copy.2545613b2ba8", { defaultValue: "Post options" })}
      {...props}
      className={cn('relative flex h-11 w-11 shrink-0 items-center justify-center text-zinc-400 hover:text-white transition-colors', className)}
      style={{ margin: -padding, ...style }}
    >
      <MoreVertical
        style={{
          width: iconSize,
          height: iconSize,
          // Align the edge of the vertical dots on the 32-unit grid.
          transform: `translateX(${iconSize * (14 / 32)}px)`,
        }}
      />
    </button>
  );
}
