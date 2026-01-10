import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface FilterSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  unit?: string;
}

export function FilterSlider({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  unit = '',
}: FilterSliderProps) {
  const isModified = value !== defaultValue;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400 tabular-nums w-12 text-right">
            {value}{unit}
          </span>
          {isModified && (
            <button
              onClick={() => onChange(defaultValue)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Reset to default"
            >
              <RotateCcw className="w-3 h-3 text-zinc-400" />
            </button>
          )}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}
