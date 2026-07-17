/**
 * StarRating — Interactive & display star rating component
 * Supports half-star display for averages, full-star input for reviews.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  showValue?: boolean;
  count?: number;
}

const SIZES = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-7 h-7' };

export function StarRating({ value, onChange, size = 'md', readonly = false, showValue = false, count }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div className="flex items-center gap-1">
      <div
        className={cn('flex gap-0.5', !readonly && 'cursor-pointer')}
        onMouseLeave={() => !readonly && setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map(star => {
          const filled = display >= star;
          const halfFilled = !filled && display >= star - 0.5;
          return (
            <button
              key={star}
              type="button"
              disabled={readonly}
              onClick={() => onChange?.(star)}
              onMouseEnter={() => !readonly && setHovered(star)}
              className={cn(
                'relative transition-all duration-150',
                !readonly && 'hover:scale-110 active:scale-95',
                readonly && 'cursor-default'
              )}
            >
              {/* Background star (empty) */}
              <Star className={cn(SIZES[size], 'text-white/20 fill-white/5')} />
              {/* Filled overlay */}
              {(filled || halfFilled) && (
                <Star
                  className={cn(
                    SIZES[size],
                    'absolute inset-0 text-amber-400 fill-amber-400 transition-colors',
                    halfFilled && 'clip-half'
                  )}
                  style={halfFilled ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
                />
              )}
            </button>
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-medium text-primary-foreground ml-1">
          {value.toFixed(1)}
        </span>
      )}
      {count !== undefined && (
        <span className="text-xs text-zinc-500 ml-0.5">({count})</span>
      )}
    </div>
  );
}
