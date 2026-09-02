import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSkill, useUpdateSkill, uploadSkillAsset, type UserSkill } from '@/hooks/use-user-skills';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: UserSkill | null;
}

export function SkillCreateModal({ open, onOpenChange, editing }: Props) {
  const { t } = useTranslation();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [phrasesText, setPhrasesText] = useState((editing?.trigger_phrases ?? []).join(', '));
  const [systemPrompt, setSystemPrompt] = useState(editing?.system_prompt ?? '');
  const [kind, setKind] = useState<'image' | 'chat'>(editing?.kind ?? 'image');
  const [assets, setAssets] = useState<string[]>(editing?.asset_urls ?? []);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (assets.length + files.length > 5) {
      toast.error(t('skills.maxAssets'));
      return;
    }
    setUploading(true);
    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-') || 'draft';
      const urls = await Promise.all(files.map((f) => uploadSkillAsset(f, slug)));
      setAssets((prev) => [...prev, ...urls]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('skills.uploadFailed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error(t('skills.nameAndPromptRequired'));
      return;
    }
    const phrases = phrasesText.split(',').map((s) => s.trim()).filter(Boolean);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      trigger_phrases: phrases,
      system_prompt: systemPrompt.trim(),
      asset_urls: assets,
      kind,
      model: kind === 'image' ? 'google/gemini-3.1-flash-image' : 'google/gemini-3-flash-preview',
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload });
        toast.success(t('skills.skillUpdated'));
      } else {
        await create.mutateAsync(payload);
        toast.success(t('skills.skillCreated'));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('skills.failedToSave'));
    }
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column className="bg-zinc-900 border-white/10 max-h-[92vh]">
        <div className="mx-auto w-full max-w-xl px-4 pb-6 overflow-y-auto">
        <DrawerHeader className="px-0">
          <DrawerTitle>{t(editing ? 'skills.editSkill' : 'skills.createSkill')}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('skills.name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('skills.namePlaceholder')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('skills.description')}</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('skills.descriptionPlaceholder')} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('skills.triggerPhrasesComma')}</label>
            <Input value={phrasesText} onChange={(e) => setPhrasesText(e.target.value)} placeholder={t('skills.triggerPhrasesPlaceholder')} />
            <p className="text-[11px] text-zinc-500 mt-1">{t('skills.autoActivateHint')}</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('skills.type')}</label>
            <div className="flex gap-2">
              {(['image', 'chat'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    kind === k ? 'bg-white/15 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-400'
                  }`}
                >
                  {t(k === 'image' ? 'skills.kindImage' : 'skills.kindChat')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{t('skills.systemPrompt')}</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder={t('skills.systemPromptPlaceholder')}
              className="resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">{t('skills.brandAssets', { count: assets.length })}</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {assets.map((url, i) => (
                <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAssets((p) => p.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/80 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {assets.length < 5 && (
                <label className="w-16 h-16 rounded-lg border border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-white/30 transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Plus className="w-5 h-5 text-zinc-500" />}
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">{t('skills.brandAssetsHint')}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('skills.cancel')}</Button>
            <LiquidGlassBubble2
              onClick={handleSave}
              disabled={isSaving}
              loading={isSaving}
              label={t(editing ? 'skills.saveChanges' : 'skills.createSkillAction')}
              width="160px"
            />
          </div>
        </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
