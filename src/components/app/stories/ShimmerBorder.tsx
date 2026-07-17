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
      className={`rounded-xl p-[2px] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] ${className}`}
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.3))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
        border: active ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="rounded-[10px] overflow-hidden" style={{ opacity: active ? 1 : 0.55 }}>
        {children}
      </div>
    </div>
  );
}
