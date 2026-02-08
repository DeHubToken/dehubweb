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
  // Both states use the same liquid glass gradient border as the Create button
  return (
    <div className={`rounded-xl bg-gradient-to-br from-white/40 via-white/20 to-white/5 p-[2px] ${active ? 'story-shimmer-border' : ''} ${className}`}>
      {children}
    </div>
  );
}
