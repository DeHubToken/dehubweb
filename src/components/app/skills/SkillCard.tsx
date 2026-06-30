import { Sparkles, Star } from 'lucide-react';
import type { UserSkill } from '@/hooks/use-user-skills';

interface Props {
  skill: UserSkill;
  onClick: () => void;
}

export function SkillCard({ skill, onClick }: Props) {
  const thumb = skill.asset_urls?.[0];
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 hover:border-white/25 transition-colors overflow-hidden flex flex-col"
    >
      <div className="aspect-[16/9] w-full bg-gradient-to-br from-white/[0.04] to-transparent relative overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={skill.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white/30" />
          </div>
        )}
        {skill.is_featured && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white">
            <Star className="w-3 h-3 fill-white" /> Featured
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white truncate">{skill.name}</h3>
          <span className="text-[10px] text-zinc-500 shrink-0">{skill.usage_count} uses</span>
        </div>
        <p className="text-xs text-zinc-400 line-clamp-2">{skill.description || 'No description'}</p>
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-[11px] text-zinc-500 truncate">@{skill.creator_username || skill.creator_wallet_address.slice(0, 6)}</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{skill.kind}</span>
        </div>
      </div>
    </button>
  );
}
