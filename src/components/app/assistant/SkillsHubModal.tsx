/**
 * SkillsHubModal
 * ==============
 * Browse, search, use, and create AI Skills — the DeHub equivalent of
 * ChatGPT's GPTs / Claude Projects / Poe bots. A skill bundles a name,
 * trigger phrases, a system prompt, optional reference asset URLs, and
 * a preferred model. When picked from here it gets injected into the
 * assistant composer so the next message runs with that skill's context.
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Search, Plus, Sparkles, Trash2, Wand2, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useUserSkills,
  useCreateSkill,
  useDeleteSkill,
  type UserSkill,
} from '@/hooks/use-user-skills';

interface SkillsHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseSkill: (skill: UserSkill) => void;
}

type Tab = 'browse' | 'mine' | 'create';

const MODELS: { value: string; label: string; kind: 'image' | 'chat' }[] = [
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast chat)', kind: 'chat' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (deep chat)', kind: 'chat' },
  { value: 'openai/gpt-5', label: 'GPT-5 (chat)', kind: 'chat' },
  { value: 'premium.gpt', label: 'GPT-image-2 medium (image)', kind: 'image' },
  { value: 'google/gemini-3.1-flash-image', label: 'Nano Banana 2 (image, cheap)', kind: 'image' },
];

export function SkillsHubModal({ open, onOpenChange, onUseSkill }: SkillsHubModalProps) {
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase();
  const { data: skills = [], isLoading } = useUserSkills();
  const createSkill = useCreateSkill();
  const deleteSkill = useDeleteSkill();

  const [tab, setTab] = useState<Tab>('browse');
  const [query, setQuery] = useState('');

  // Create form
  const [form, setForm] = useState({
    name: '',
    description: '',
    kind: 'chat' as 'chat' | 'image',
    model: 'google/gemini-2.5-flash',
    triggers: '',
    systemPrompt: '',
    assetUrls: '',
  });

  const filtered = useMemo(() => {
    const list = tab === 'mine' ? skills.filter(s => s.creator_wallet_address === wallet) : skills;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.trigger_phrases.some(t => t.toLowerCase().includes(q))
    );
  }, [skills, tab, query, wallet]);

  const featured = useMemo(() => filtered.filter(s => s.is_featured), [filtered]);
  const community = useMemo(() => filtered.filter(s => !s.is_featured), [filtered]);

  const resetForm = () => setForm({
    name: '', description: '', kind: 'chat', model: 'google/gemini-2.5-flash',
    triggers: '', systemPrompt: '', assetUrls: '',
  });

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error('Name and instructions are required');
      return;
    }
    try {
      const created = await createSkill.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || form.name.trim(),
        kind: form.kind,
        model: form.model,
        trigger_phrases: form.triggers.split(',').map(t => t.trim()).filter(Boolean),
        system_prompt: form.systemPrompt.trim(),
        asset_urls: form.assetUrls.split('\n').map(s => s.trim()).filter(Boolean),
      });
      toast.success(`Created "${created.name}"`);
      resetForm();
      setTab('mine');
    } catch (e: any) {
      toast.error(e?.message || 'Could not create skill');
    }
  };

  const renderSkill = (s: UserSkill) => {
    const isMine = s.creator_wallet_address === wallet;
    return (
      <div
        key={s.id}
        className="group rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-xl p-4 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {s.is_featured && <Sparkles className="w-3.5 h-3.5 text-white/80 shrink-0" />}
              <h4 className="text-sm font-semibold text-white truncate">{s.name}</h4>
              <span className="text-[10px] uppercase tracking-wider text-white/40 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                {s.kind}
              </span>
            </div>
            <p className="text-xs text-white/60 line-clamp-2 mb-2">{s.description}</p>
            {s.trigger_phrases.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {s.trigger_phrases.slice(0, 4).map(t => (
                  <span key={t} className="text-[10px] text-white/50 px-1.5 py-0.5 rounded bg-white/5">
                    /{t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 text-[10px] text-white/30">
              {s.creator_username ? `@${s.creator_username}` : `${s.creator_wallet_address.slice(0, 6)}…`}
              {' · '}{s.usage_count} uses
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => { onUseSkill(s); onOpenChange(false); }}
              className="text-xs text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
            >
              Use
            </button>
            {isMine && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${s.name}"?`)) return;
                  try { await deleteSkill.mutateAsync(s.id); toast.success('Deleted'); }
                  catch (e: any) { toast.error(e?.message || 'Failed'); }
                }}
                className="text-xs text-white/50 hover:text-red-400 rounded-lg px-2 py-1 transition-colors flex items-center justify-center"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 bg-black/80 backdrop-blur-2xl border-white/10">
        <DialogHeader className="p-5 pb-3 border-b border-white/5">
          <DialogTitle className="text-white flex items-center gap-2">
            {tab === 'create' && (
              <button onClick={() => setTab('browse')} className="text-white/60 hover:text-white">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Wand2 className="w-4 h-4 text-white/80" />
            {tab === 'create' ? 'Create a skill' : 'Skills library'}
          </DialogTitle>
          <p className="text-xs text-white/50 mt-1">
            {tab === 'create'
              ? 'Package instructions, references, and a preferred model into a reusable skill.'
              : 'Reusable AI recipes — like GPTs or Claude Projects. Pick one to load its context into the composer.'}
          </p>
        </DialogHeader>

        {tab !== 'create' && (
          <>
            <div className="p-4 pb-2 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search skills…"
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-xl"
                />
              </div>
              <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
                {(['browse', 'mine'] as Tab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg transition-colors',
                      tab === t ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                    )}
                  >
                    {t === 'browse' ? 'All' : 'Mine'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setTab('create')}
                className="text-xs text-white bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading skills…
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-white/50 text-sm">
                  No skills yet. <button className="underline hover:text-white" onClick={() => setTab('create')}>Create the first one</button>.
                </div>
              ) : (
                <>
                  {featured.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2 px-1">Featured</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {featured.map(renderSkill)}
                      </div>
                    </div>
                  )}
                  {community.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2 px-1 mt-4">
                        {tab === 'mine' ? 'Your skills' : 'Community'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {community.map(renderSkill)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {tab === 'create' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-1 block">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Startup Landing Copywriter"
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Short description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this skill does in one line"
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Kind</label>
                <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
                  {(['chat', 'image'] as const).map(k => (
                    <button
                      key={k}
                      onClick={() => setForm({ ...form, kind: k, model: MODELS.find(m => m.kind === k)!.value })}
                      className={cn(
                        'flex-1 text-xs py-1.5 rounded-lg transition-colors',
                        form.kind === k ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Model</label>
                <select
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-sm"
                >
                  {MODELS.filter(m => m.kind === form.kind).map(m => (
                    <option key={m.value} value={m.value} className="bg-black">{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Trigger phrases <span className="text-white/30">(comma-separated, used with /)</span></label>
              <Input
                value={form.triggers}
                onChange={(e) => setForm({ ...form, triggers: e.target.value })}
                placeholder="e.g. landing, headline, copywriter"
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">System instructions *</label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="You are a world-class landing page copywriter. Always…"
                rows={7}
                className="bg-white/5 border-white/10 text-white rounded-xl resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">Reference asset URLs <span className="text-white/30">(one per line, optional)</span></label>
              <Textarea
                value={form.assetUrls}
                onChange={(e) => setForm({ ...form, assetUrls: e.target.value })}
                placeholder="https://…/logo.png"
                rows={2}
                className="bg-white/5 border-white/10 text-white rounded-xl resize-none text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { resetForm(); setTab('browse'); }}
                className="text-xs text-white/60 hover:text-white px-3 py-2"
              >
                Cancel
              </button>
              <LiquidGlassBubble2
                label={createSkill.isPending ? 'Creating…' : 'Create skill'}
                onClick={handleCreate}
                width="auto"
                height="36px"
                className="[&>div]:!px-4"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
