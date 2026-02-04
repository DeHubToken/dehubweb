/**
 * Ad Space Component
 * ==================
 * Placeholder for advertising content.
 * 
 * @module components/app/ads/AdSpace
 */

import { cn } from '@/lib/utils';

interface AdSpaceProps {
  className?: string;
  variant?: 'banner' | 'rectangle' | 'leaderboard';
}

const variantStyles = {
  banner: 'h-[90px] sm:h-[100px]', // Mobile banner
  rectangle: 'h-[250px]', // Medium rectangle
  leaderboard: 'h-[90px]', // Leaderboard
};

export function AdSpace({ className, variant = 'rectangle' }: AdSpaceProps) {
  return (
    <div 
      className={cn(
        'w-full rounded-xl bg-muted/30 border border-border/50 flex items-center justify-center',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
        <span className="text-xs uppercase tracking-wider">Advertisement</span>
      </div>
    </div>
  );
}
