import { generateFilterCSS } from '@/lib/filters';
import type { FilterPreset } from '../types/filters';
import { cn } from '@/lib/utils';

interface FilterPresetCardProps {
  preset: FilterPreset;
  imageUrl: string;
  thumbnailUrl?: string; // For videos, use extracted frame instead of video element
  isSelected: boolean;
  onClick: () => void;
}

export function FilterPresetCard({
  preset,
  imageUrl,
  thumbnailUrl,
  isSelected,
  onClick,
}: FilterPresetCardProps) {
  const filterCSS = generateFilterCSS(preset.settings);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all duration-200 shrink-0',
        isSelected
          ? 'bg-white/10 ring-2 ring-white/60'
          : 'hover:bg-white/5'
      )}
    >
      {/* Thumbnail - maintains aspect ratio */}
      <div
        className={cn(
          'rounded-lg overflow-hidden border-2 transition-all',
          isSelected ? 'border-white/60 shadow-[0_0_12px_rgba(255,255,255,0.2)]' : 'border-transparent'
        )}
        style={{ maxWidth: '80px', maxHeight: '60px' }}
      >
        {/* Always use img for preset cards - CSS filters work identically */}
        <img
          src={thumbnailUrl || imageUrl}
          alt={preset.name}
          className="w-auto h-auto max-w-[80px] max-h-[60px] object-contain"
          style={{ filter: filterCSS }}
        />
      </div>
      
      {/* Label */}
      <div className="flex flex-col items-center">
        {preset.emoji && <span className="text-lg leading-none">{preset.emoji}</span>}
        <span
          className={cn(
            'text-[10px] font-medium mt-0.5 transition-colors',
            isSelected ? 'text-white' : 'text-zinc-400'
          )}
        >
          {preset.name}
        </span>
      </div>
    </button>
  );
}
