/**
 * Emperor Thumb
 * =============
 * Your own 👍 (or 👎) on a post, played as the arena verdict: a closed fist
 * held out sideways, the thumb slowly coming out and pointing up (or down),
 * held, then drawn back into the fist, a rest, and again.
 *
 * Drawn rather than an emoji so the thumb can really come out of the fist:
 * the thumb is its own shape, turning on its base. Transform only, so it is
 * cheap on Safari. The motion lives in index.css (.dehub-emperor).
 */

import { cn } from '@/lib/utils';

export function EmperorThumb({ down = false, className }: { down?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('dehub-emperor', down && 'dehub-emperor--down', className)}
      aria-hidden="true"
    >
      <g className="dehub-emperor-hand">
        <rect x="6" y="13" width="20" height="14" rx="5" fill="#FFC83D" stroke="#C98500" strokeWidth="1.4" />
        <path d="M18.5 16.6h6M18.5 20h6.6M18.5 23.4h6" stroke="#C98500" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <g className="dehub-emperor-thumb">
          <rect x="7.25" y="3" width="5.5" height="12" rx="2.75" fill="#FFC83D" stroke="#C98500" strokeWidth="1.4" />
          <rect x="8.4" y="4.3" width="3.2" height="3.4" rx="1.4" fill="#FFE29A" />
        </g>
      </g>
    </svg>
  );
}
