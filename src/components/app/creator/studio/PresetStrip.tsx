/**
 * Preset strip.
 * =============
 * The answer to the blank prompt box. Each tile carries a proven prompt
 * scaffold plus the model and aspect that make it work, so picking one and
 * typing a subject is the whole job.
 */
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { presetsFor, type CreatorPreset, type PresetKind } from '@/lib/creator/presets';

interface PresetStripProps {
  kind: PresetKind;
  activeId: string | null;
  onPick: (preset: CreatorPreset | null) => void;
}

export function PresetStrip({ kind, activeId, onPick }: PresetStripProps) {
  const presets = useMemo(() => presetsFor(kind), [kind]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Presets</h2>
        {activeId && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            Clear preset
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {presets.map((preset) => {
          const active = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPick(active ? null : preset)}
              aria-pressed={active}
              aria-label={`${preset.name} preset. ${preset.hint}`}
              className={cn(
                'group relative w-[10.5rem] shrink-0 rounded-xl border p-3 text-left transition',
                active
                  ? 'border-white/40 bg-white/[0.12] shadow-[0_0_12px_rgba(255,255,255,0.12)]'
                  : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.09]',
              )}
            >
              {active && (
                <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                  <Check className="h-3 w-3 text-black" />
                </span>
              )}
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {preset.group}
              </span>
              <span className="mt-1 block truncate pr-4 text-[13px] font-semibold text-white">
                {preset.name}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/45 line-clamp-2">
                {preset.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
