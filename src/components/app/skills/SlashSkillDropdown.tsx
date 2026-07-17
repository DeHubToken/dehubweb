/**
 * Slash-command dropdown for the AI assistant composer.
 * Triggered when the user types `/` followed by ≥2 chars (or `/` alone shows all).
 * Selecting a skill replaces the `/query` token with `/slug ` in the textarea.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Sparkles, LayoutGrid, ImageIcon, MessageSquare } from 'lucide-react';
import type { UserSkill } from '@/hooks/use-user-skills';

interface Props {
  isOpen: boolean;
  query: string;                 // text after the leading `/`
  skills: UserSkill[];
  selectedIndex: number;
  onSelectedIndexChange: (i: number) => void;
  onSelect: (skill: UserSkill) => void;
  onOpenAll: () => void;
  onClose: () => void;
}

export function filterSkills(query: string, skills: UserSkill[]): UserSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...skills]
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || b.usage_count - a.usage_count)
      .slice(0, 8);
  }
  const scored: { s: UserSkill; score: number }[] = [];
  for (const s of skills) {
    const slug = s.slug.toLowerCase();
    const name = s.name.toLowerCase();
    const phrases = (s.trigger_phrases ?? []).map((p) => p.toLowerCase());
    let score = 0;
    if (slug.startsWith(q)) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (slug.includes(q)) score = 60;
    else if (name.includes(q)) score = 50;
    else if (phrases.some((p) => p.includes(q))) score = 30;
    if (score > 0) {
      if (s.is_featured) score += 5;
      scored.push({ s, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score || b.s.usage_count - a.s.usage_count).slice(0, 8).map((x) => x.s);
}

export function SlashSkillDropdown({
  isOpen,
  query,
  skills,
  selectedIndex,
  onSelectedIndexChange,
  onSelect,
  onOpenAll,
  onClose,
}: Props) {
  const results = useMemo(() => filterSkills(query, skills), [query, skills]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onSelectedIndexChange(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl bg-black/70 backdrop-blur-[24px] border border-white/10 shadow-2xl overflow-hidden max-w-md"
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
        <div className="text-[11px] uppercase tracking-wider text-white/50 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Skills {query && <span className="normal-case tracking-normal text-white/40">— "{query}"</span>}
        </div>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onOpenAll(); }}
          className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 flex items-center gap-1"
        >
          <LayoutGrid className="w-3 h-3" /> Show all
        </button>
      </div>
      {results.length === 0 ? (
        <div className="px-3 py-4 text-xs text-white/50">
          No skills match. <button type="button" onMouseDown={(e) => { e.preventDefault(); onOpenAll(); }} className="underline text-white/80">Browse all skills</button>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto py-1">
          {results.map((s, i) => {
            const active = i === selectedIndex;
            const Icon = s.kind === 'image' ? ImageIcon : MessageSquare;
            return (
              <button
                key={s.id}
                type="button"
                onMouseEnter={() => onSelectedIndexChange(i)}
                onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
                className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                {s.asset_urls?.[0] ? (
                  <img src={s.asset_urls[0]} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-white/70" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{s.name}</span>
                    <span className="text-[10px] text-white/40 font-mono truncate">/{s.slug}</span>
                    {s.is_featured && <span className="text-[9px] uppercase tracking-wide text-white/60 border border-white/15 rounded px-1">Feat</span>}
                  </div>
                  {s.description && <div className="text-[11px] text-white/50 truncate">{s.description}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
