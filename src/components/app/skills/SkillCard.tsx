import { Sparkles, ArrowUpRight, Trash2 } from 'lucide-react';
import type { UserSkill } from '@/hooks/use-user-skills';

interface Props {
  skill: UserSkill;
  /** Primary action — using the skill (whole card is the trigger). */
  onClick: () => void;
  /** Optional owner action — renders a delete affordance in the action bar. */
  onDelete?: () => void;
}

export function SkillCard({ skill, onClick, onDelete }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group text-left rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 hover:border-white/25 transition-colors overflow-hidden flex flex-col relative cursor-pointer"
    >
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white/60 shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{skill.name}</h3>
        </div>
        <p className="text-xs text-zinc-400 line-clamp-3">{skill.description || 'No description'}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11px] text-zinc-500 truncate">@{skill.creator_username || skill.creator_wallet_address.slice(0, 6)}</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{skill.usage_count} uses</span>
        </div>
      </div>
      {/* Use — full-width action along the bottom, optional delete alongside */}
      <div className="flex items-stretch border-t border-white/10">
        <div className="flex-1 flex items-center justify-center gap-1 h-9 bg-white/5 group-hover:bg-white/15 transition-colors text-[11px] font-semibold uppercase tracking-wider text-white">
          Use <ArrowUpRight className="w-3.5 h-3.5" />
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete skill"
            className="w-10 shrink-0 flex items-center justify-center border-l border-white/10 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
