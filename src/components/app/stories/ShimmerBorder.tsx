/**
 * ShimmerBorder
 * =============
 * Animated "light on glass" border for unwatched story thumbnails.
 * A soft white conic highlight sweeps around the rounded-xl border,
 * creating the illusion of light catching a glass surface.
 * Watched stories show a static dim border instead.
 */

import { type ReactNode } from 'react';

interface ShimmerBorderProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function ShimmerBorder({ active, children, className = '' }: ShimmerBorderProps) {
  if (!active) {
    // Watched state: static dim border
    return (
      <div className={`rounded-xl border border-white/10 p-[1px] ${className}`}>
        {children}
      </div>
    );
  }

  // Unwatched state: animated shimmer border
  return (
    <div className={`story-shimmer-border rounded-xl p-[2px] ${className}`}>
      {children}
    </div>
  );
}
