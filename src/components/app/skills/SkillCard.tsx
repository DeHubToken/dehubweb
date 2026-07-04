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
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-[10px] font-semibold uppercase tracking-wider text-white group-hover:bg-white/20 transition-colors">
        Use <ArrowUpRight className="w-3 h-3" />
      </div>
      {skill.is_featured && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white">
          <Star className="w-3 h-3 fill-white" /> Featured
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 pr-16">
          <Sparkles className="w-4 h-4 text-white/60 shrink-0" />
          <h3 className="text-sm font-semibold text-white truncate">{skill.name}</h3>
        </div>
        <p className="text-xs text-zinc-400 line-clamp-3">{skill.description || 'No description'}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11px] text-zinc-500 truncate">@{skill.creator_username || skill.creator_wallet_address.slice(0, 6)}</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{skill.kind} · {skill.usage_count} uses</span>
        </div>
      </div>
    </button>
  );
}
