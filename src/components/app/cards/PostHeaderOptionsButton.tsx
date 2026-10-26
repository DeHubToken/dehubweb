import { useTranslation as _useCopy } from 'react-i18next';
import type { ButtonHTMLAttributes } from 'react';
import { Zap } from 'lucide-react';
import MoreVertical from '@/components/ui/cut-icons/morevertical';
import { cn } from '@/lib/utils';

/** Header icons in a card corner. */
export const HEADER_ICON_SIZE = 20;
/** How far the visible dots sit inside the card's content box, from the top
 *  and from the side alike: with the bento's 12px padding, 18px from its edge. */
const CORNER_INSET = 6;
/** The cut dots fill x 14-18, y 4-28 of their 32-unit grid. */
const dotsShiftX = (size: number, corner: boolean) => size * (14 / 32) - (corner ? CORNER_INSET : 0);
/** Lowers corner glyphs so the dots' top sits CORNER_INSET below the content's top. */
const cornerDrop = (size: number) => CORNER_INSET - size * (4 / 32);

type PostHeaderOptionsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  iconSize?: number;
  /** Inset the dots the same from the content's top as from its side.
   *  Off for buttons that sit in a row rather than in a card's corner. */
  corner?: boolean;
};

/** Align the visible dots with the card corner, retaining a 44px tap target. */
export function PostHeaderOptionsButton({
  iconSize = HEADER_ICON_SIZE,
  corner = true,
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
        data-corner-dots={corner ? '' : undefined}
        style={{
          width: iconSize,
          height: iconSize,
          transform: `translateX(${dotsShiftX(iconSize, corner)}px)`,
          // A separate property from the transform so overlay layouts can drop it in CSS.
          translate: corner ? `0 ${cornerDrop(iconSize)}px` : undefined,
        }}
      />
    </button>
  );
}

/**
 * The owner's Boost bolt beside the corner dots: same size, same drop, and
 * 14px clear of the dots' glyph box. `rowGap` is the parent's flex gap.
 */
export function PostHeaderBoostButton({
  rowGap,
  lit,
  className,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  rowGap: number;
  /** The post is boosted: a solid bolt that glows, in the same spot. */
  lit?: boolean;
}) {
  return (
    <button
      type="button"
      data-head-boost
      data-boost-lit={lit ? '' : undefined}
      {...props}
      className={cn(
        'shrink-0 transition-colors active:scale-95 disabled:opacity-40',
        lit ? 'text-white' : 'text-zinc-400 hover:text-white',
        className,
      )}
      // The dots are pushed CORNER_INSET short of their own shift, so the
      // bolt keeps 14px between the two glyph boxes.
      style={{ marginRight: 14 - rowGap - dotsShiftX(HEADER_ICON_SIZE, true), ...style }}
    >
      <Zap
        data-corner-dots=""
        fill={lit ? 'currentColor' : 'none'}
        style={{ width: HEADER_ICON_SIZE, height: HEADER_ICON_SIZE, translate: `0 ${cornerDrop(HEADER_ICON_SIZE)}px` }}
      />
    </button>
  );
}
