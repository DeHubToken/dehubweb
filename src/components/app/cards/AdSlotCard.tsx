/**
 * AdSlotCard
 * ==========
 * "Your Advert Here" placeholder used to fill empty spaces in the
 * masonry grid on wide (full screen / collapsed sidebar) layouts.
 * CTA opens the advertiser docs / dashboard.
 */

import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdSlotCardProps {
  variant?: 'sm' | 'md' | 'lg';
  className?: string;
}

const heightByVariant: Record<NonNullable<AdSlotCardProps['variant']>, string> = {
  sm: 'h-40',
  md: 'h-56',
  lg: 'h-72',
};

export const AdSlotCard = ({ variant = 'md', className }: AdSlotCardProps) => {
  return (
    <div
      className={cn(
        'relative w-full rounded-2xl overflow-hidden',
        'bg-black/60 backdrop-blur-[24px] border border-white/10',
        'flex flex-col items-center justify-center text-center px-4 py-6',
        heightByVariant[variant],
        className
      )}
    >
      <div className="flex items-center gap-2 text-white/50 text-[10px] uppercase tracking-[0.18em] mb-3">
        <span className="w-1 h-1 rounded-full bg-white/40" />
        Sponsored slot
        <span className="w-1 h-1 rounded-full bg-white/40" />
      </div>

      <Megaphone className="w-6 h-6 text-white/70 mb-2" strokeWidth={1.75} />

      <h4 className="text-white/90 font-semibold text-sm mb-1">
        Your advert here
      </h4>
      <p className="text-white/50 text-xs mb-4 max-w-[220px] leading-snug">
        Reach the community. Launch a campaign in minutes.
      </p>

      <Link
        to="/docs/advertising"
        className={cn(
          'inline-flex items-center justify-center',
          'px-4 py-1.5 rounded-lg text-xs font-medium',
          'bg-white/10 hover:bg-white/20 text-white',
          'border border-white/15 transition-colors'
        )}
      >
        Advertise with us
      </Link>
    </div>
  );
};

export default AdSlotCard;
