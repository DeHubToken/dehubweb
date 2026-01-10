import { generateFilterCSS } from '@/lib/filters';
import type { FilterPreset } from '../types/filters';
import { cn } from '@/lib/utils';

interface FilterPresetCardProps {
  preset: FilterPreset;
  imageUrl: string;
  isSelected: boolean;
  onClick: () => void;
}

export function FilterPresetCard({
  preset,
  imageUrl,
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
          ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 ring-2 ring-cyan-400/60'
          : 'hover:bg-white/5'
      )}
    >
      {/* Thumbnail - maintains aspect ratio */}
      <div
        className={cn(
          'rounded-lg overflow-hidden border-2 transition-all',
          isSelected ? 'border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.3)]' : 'border-transparent'
        )}
        style={{ maxWidth: '80px', maxHeight: '60px' }}
      >
        <img
          src={imageUrl}
          alt={preset.name}
          className="w-auto h-auto max-w-[80px] max-h-[60px] object-contain"
          style={{ filter: filterCSS }}
        />
      </div>
      
      {/* Label */}
      <div className="flex flex-col items-center">
        <span className="text-lg leading-none">{preset.emoji}</span>
        <span
          className={cn(
            'text-[10px] font-medium mt-0.5 transition-colors',
            isSelected ? 'text-cyan-300' : 'text-zinc-400'
          )}
        >
          {preset.name}
        </span>
      </div>
    </button>
  );
}
