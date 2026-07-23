import { Sparkles, Star, ArrowUpRight } from 'lucide-react';
import type { UserSkill } from '@/hooks/use-user-skills';

interface Props {
  skill: UserSkill;
  onClick: () => void;
}

export function SkillCard({ skill, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 hover:border-white/25 transition-colors overflow-hidden flex flex-col relative"
    >
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white/60 shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{skill.name}</h3>
          {skill.is_featured && <Star className="w-3.5 h-3.5 fill-white text-white shrink-0 ml-auto" />}
        </div>
        <p className="text-xs text-zinc-400 line-clamp-3">{skill.description || 'No description'}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11px] text-zinc-500 truncate">@{skill.creator_username || skill.creator_wallet_address.slice(0, 6)}</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{skill.usage_count} uses</span>
        </div>
      </div>
      {/* Use — full-width action along the bottom */}
      <div className="flex items-center justify-center gap-1 h-9 border-t border-white/10 bg-white/5 group-hover:bg-white/15 transition-colors text-[11px] font-semibold uppercase tracking-wider text-white">
        Use <ArrowUpRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}
