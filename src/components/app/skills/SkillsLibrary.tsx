import { useMemo, useState } from 'react';
import { Search, Plus, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSkills, type UserSkill } from '@/hooks/use-user-skills';
import { SkillCard } from './SkillCard';
import { SkillCreateModal } from './SkillCreateModal';
import { SkillDetailDrawer } from './SkillDetailDrawer';

type Filter = 'all' | 'featured' | 'mine';

export function SkillsLibrary() {
  const { walletAddress } = useAuth();
  const { data: skills = [], isLoading } = useUserSkills();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserSkill | null>(null);
  const [detail, setDetail] = useState<UserSkill | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wallet = walletAddress?.toLowerCase();
    return skills.filter((s) => {
      if (filter === 'featured' && !s.is_featured) return false;
      if (filter === 'mine' && (!wallet || s.creator_wallet_address.toLowerCase() !== wallet)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.creator_username ?? '').toLowerCase().includes(q) ||
        s.trigger_phrases.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [skills, query, filter, walletAddress]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Skills
          </h2>
          <p className="text-xs text-zinc-500">Reusable prompt + brand kits for the AI assistant. Anyone can create or use them.</p>
        </div>
        <LiquidGlassBubble2 onClick={() => { setEditing(null); setCreateOpen(true); }} disabled={!walletAddress}>
          <Plus className="w-4 h-4 mr-1" /> Create Skill
        </LiquidGlassBubble2>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, trigger phrase, or creator…"
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'featured', 'mine'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs capitalize border transition-colors ${
                filter === f ? 'bg-white/15 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-10 text-center text-zinc-500 text-sm">
          {query ? 'No skills match your search.' : filter === 'mine' ? 'You haven\'t created any skills yet.' : 'No skills yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <SkillCard key={s.id} skill={s} onClick={() => setDetail(s)} />
          ))}
        </div>
      )}

      <SkillCreateModal open={createOpen} onOpenChange={setCreateOpen} editing={editing} />
      <SkillDetailDrawer
        skill={detail}
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        onEdit={(s) => { setEditing(s); setCreateOpen(true); }}
      />
    </div>
  );
}
