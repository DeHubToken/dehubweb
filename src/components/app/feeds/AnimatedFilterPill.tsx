/**
 * Animated Filter Pill
 * ====================
 * Reusable button with a framer-motion layoutId indicator
 * that smoothly slides between options in a filter row.
 *
 * @module components/app/feeds/AnimatedFilterPill
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const INACTIVE_CLASS = 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700';

interface AnimatedFilterPillProps {
  /** Unique layout group – must be the same for every pill in a row */
  layoutId: string;
  /** Whether this pill is currently selected */
  isActive: boolean;
  /** Click handler */
  onClick: () => void;
  /** Label content */
  children: React.ReactNode;
  /** Extra classes */
  className?: string;
}

export function AnimatedFilterPill({
  layoutId,
  isActive,
  onClick,
  children,
  className,
}: AnimatedFilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        isActive ? 'text-white' : INACTIVE_CLASS,
        className,
      )}
    >
      {isActive && (
        <motion.div
          layoutId={layoutId}
          className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
