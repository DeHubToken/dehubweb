/**
 * ShimmerBorder
 * =============
 * Border wrapper for story thumbnails.
 * Unwatched stories have a bright white border,
 * watched stories have a dim, greyed-out border.
 */

import { type ReactNode } from 'react';

interface ShimmerBorderProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function ShimmerBorder({ active, children, className = '' }: ShimmerBorderProps) {
  return (
    <div
      className={`rounded-xl p-[2px] ${className}`}
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
      }}
    >
      <div className="rounded-[10px] overflow-hidden" style={{ opacity: active ? 1 : 0.55 }}>
        {children}
      </div>
    </div>
  );
}
