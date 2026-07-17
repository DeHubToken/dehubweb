/**
 * VoiceEffectSelector – horizontal pill selector for voice effects
 * Shown in the live stage view for hosts/speakers
 */

import { cn } from '@/lib/utils';
import { VOICE_EFFECTS, type VoiceEffectId } from '@/constants/voice-effects.constants';

interface VoiceEffectSelectorProps {
  activeEffect: VoiceEffectId;
  onSelect: (id: VoiceEffectId) => void;
}

export function VoiceEffectSelector({ activeEffect, onSelect }: VoiceEffectSelectorProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
        🎭 Voice Effect
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {VOICE_EFFECTS.map((effect) => (
          <button
            key={effect.id}
            onClick={() => onSelect(effect.id)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
              "border backdrop-blur-md",
              activeEffect === effect.id
                ? "bg-white/20 border-white/30 text-white"
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
            )}
            title={effect.description}
          >
            <span className="mr-1">{effect.emoji}</span>
            {effect.name}
          </button>
        ))}
      </div>
    </div>
  );
}
