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
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Search, Plus, Wand2, Loader2, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { SkillCard } from '@/components/app/skills/SkillCard';
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
  const { t } = useTranslation();
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
      s.trigger_phrases.some(phrase => phrase.toLowerCase().includes(q))
    );
  }, [skills, tab, query, wallet]);

  const resetForm = () => setForm({
    name: '', description: '', kind: 'chat', model: 'google/gemini-2.5-flash',
    triggers: '', systemPrompt: '', assetUrls: '',
  });

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error(t('skills.nameAndInstructionsRequired'));
      return;
    }
    try {
      const created = await createSkill.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || form.name.trim(),
        kind: form.kind,
        model: form.model,
        trigger_phrases: form.triggers.split(',').map(phrase => phrase.trim()).filter(Boolean),
        system_prompt: form.systemPrompt.trim(),
        asset_urls: form.assetUrls.split('\n').map(s => s.trim()).filter(Boolean),
      });
      toast.success(t('skills.createdNamed', { name: created.name }));
      resetForm();
      setTab('mine');
    } catch (e: any) {
      toast.error(e?.message || t('skills.couldNotCreate'));
    }
  };

  const handleUse = (s: UserSkill) => { onUseSkill(s); onOpenChange(false); };

  const handleDelete = async (s: UserSkill) => {
    if (!confirm(t('skills.deleteConfirm', { name: s.name }))) return;
    try { await deleteSkill.mutateAsync(s.id); toast.success(t('skills.deleted')); }
    catch (e: any) { toast.error(e?.message || t('skills.failed')); }
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
            {t(tab === 'create' ? 'skills.createASkill' : 'skills.skillsLibrary')}
          </DialogTitle>
          <p className="text-xs text-white/50 mt-1">
            {tab === 'create'
              ? t('skills.createHint')
              : t('skills.libraryHint')}
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
                  placeholder={t('skills.searchSkills')}
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-xl"
                />
              </div>
              <div className="flex gap-1 rounded-xl bg-white/5 border border-white/10 p-1">
                {/* Named `value`, not `t` — `t` is the translator in this scope. */}
                {(['browse', 'mine'] as Tab[]).map(value => (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg transition-colors',
                      tab === value ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'
                    )}
                  >
                    {t(value === 'browse' ? 'skills.filterAll' : 'skills.filterMine')}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setTab('create')}
                className="text-xs text-white bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t('skills.new')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-white/50 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t('skills.loadingSkills')}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-white/50 text-sm">
                  {t('skills.noneYet')} <button className="underline hover:text-white" onClick={() => setTab('create')}>{t('skills.createTheFirst')}</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filtered.map(s => (
                    <SkillCard
                      key={s.id}
                      skill={s}
                      onClick={() => handleUse(s)}
                      onDelete={s.creator_wallet_address === wallet ? () => handleDelete(s) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'create' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="text-xs text-white/60 mb-1 block">{t('skills.nameRequired')}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('skills.hubNamePlaceholder')}
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">{t('skills.shortDescription')}</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('skills.shortDescriptionPlaceholder')}
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/60 mb-1 block">{t('skills.kind')}</label>
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
                      {t(k === 'image' ? 'skills.kindImageShort' : 'skills.kindChatShort')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">{t('skills.model')}</label>
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
              <label className="text-xs text-white/60 mb-1 block">{t('skills.triggerPhrases')} <span className="text-white/30">{t('skills.triggerPhrasesHint')}</span></label>
              <Input
                value={form.triggers}
                onChange={(e) => setForm({ ...form, triggers: e.target.value })}
                placeholder={t('skills.hubTriggersPlaceholder')}
                className="bg-white/5 border-white/10 text-white rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">{t('skills.systemInstructionsRequired')}</label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder={t('skills.systemInstructionsPlaceholder')}
                rows={7}
                className="bg-white/5 border-white/10 text-white rounded-xl resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 mb-1 block">{t('skills.referenceAssetUrls')} <span className="text-white/30">{t('skills.referenceAssetUrlsHint')}</span></label>
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
                {t('skills.cancel')}
              </button>
              <LiquidGlassBubble2
                label={t(createSkill.isPending ? 'skills.creating' : 'skills.createSkillAction')}
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
