import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { Button } from '@/components/ui/button';
import { Loader2, X, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateCharacter,
  useUpdateCharacter,
  uploadCharacterAsset,
  slugifyCharacter,
  type UserCharacter,
} from '@/hooks/use-user-characters';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: UserCharacter | null;
}

const MAX_REFS = 6;

export function CharacterCreateModal({ open, onOpenChange, editing }: Props) {
  const { t: _copy } = _useCopy();
  const create = useCreateCharacter();
  const update = useUpdateCharacter();
  const [name, setName] = useSurfaceDraft("components/app/characters/CharacterCreateModal.tsx:name", '');
  const [description, setDescription] = useSurfaceDraft("components/app/characters/CharacterCreateModal.tsx:description", '');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [refs, setRefs] = useState<string[]>([]);
  const [primaryUrl, setPrimaryUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setName.initialize(editing?.name ?? '');
      setDescription.initialize(editing?.description ?? '');
      setVisibility(editing?.visibility ?? 'private');
      setRefs(editing?.reference_image_urls ?? []);
      setPrimaryUrl(editing?.primary_image_url ?? editing?.reference_image_urls?.[0] ?? null);
    }
  }, [open, editing, setDescription, setName]);

  const slugPreview = name ? slugifyCharacter(name) : '';

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (refs.length + files.length > MAX_REFS) {
      toast.error(`Max ${MAX_REFS} reference images`);
      e.target.value = '';
      return;
    }
    const oversize = files.find((f) => f.size > 8 * 1024 * 1024);
    if (oversize) {
      toast.error(_copy("copy.e128de648a98", { defaultValue: "Each image must be under 8MB" }));
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const slug = slugPreview || 'draft';
      const urls = await Promise.all(files.map((f) => uploadCharacterAsset(f, slug)));
      setRefs((prev) => {
        const next = [...prev, ...urls];
        if (!primaryUrl && next.length > 0) setPrimaryUrl(next[0]);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeRef = (url: string) => {
    setRefs((p) => p.filter((u) => u !== url));
    if (primaryUrl === url) {
      setPrimaryUrl(refs.find((u) => u !== url) ?? null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error(_copy("copy.6a99a6232864", { defaultValue: "Give your character a name" }));
    if (refs.length === 0) return toast.error(_copy("copy.7b72c9f162cc", { defaultValue: "Add at least one reference image" }));
    const payload = {
      name: name.trim(),
      description: description.trim(),
      reference_image_urls: refs,
      primary_image_url: primaryUrl ?? refs[0],
      visibility,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload });
        toast.success(_copy("copy.9b28eeeae8c9", { defaultValue: "Character updated" }));
      } else {
        await create.mutateAsync(payload);
        toast.success(_copy("copy.2b81be13f577", { defaultValue: "Character created" }));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-zinc-900 border-white/10 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? _copy("copy.c2e08169f2db", { defaultValue: "Edit Character" }) : _copy("copy.fd8c3b1965fd", { defaultValue: "Create Character" })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{_copy("copy.dcd1d5223f73", { defaultValue: "Name" })}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={_copy("copy.ec653e8e8748", { defaultValue: "Nova" })} />
            {slugPreview && (
              <p className="text-[11px] text-zinc-500 mt-1">{_copy("copy.4063f4cd2b3c", { defaultValue: "Reference in prompts as " })}<span className="text-white">@{slugPreview}</span>
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{_copy("copy.6a5f3874d8ec", { defaultValue: "Description / persona" })}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={_copy("copy.4437ae0544b7", { defaultValue: "28yo, silver hair, leather jacket, cinematic noir lighting" })}
              className="resize-none"
            />
            <p className="text-[11px] text-zinc-500 mt-1">{_copy("copy.78c705bd9058", { defaultValue: "Prepended to every prompt that references this character." })}</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">{_copy("copy.8d840c4d4dc7", { defaultValue: "Reference images (" })}{refs.length}/{MAX_REFS}{_copy("copy.37e140ad64ef", { defaultValue: ") — first one is the video starting frame" })}</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {refs.map((url) => (
                <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPrimaryUrl(url)}
                    className={`absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      primaryUrl === url ? 'bg-white text-black' : 'bg-black/70 text-white opacity-0 group-hover:opacity-100'
                    }`}
                    title={_copy("copy.f3268949fdec", { defaultValue: "Set as primary" })}
                  >
                    <Star className="w-3 h-3" fill={primaryUrl === url ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRef(url)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/80 flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {refs.length < MAX_REFS && (
                <label className="w-20 h-20 rounded-xl border border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-white/30 transition-colors">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Plus className="w-5 h-5 text-zinc-500" />}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">{_copy("copy.a428fbbe6ad2", { defaultValue: "Upload 1–6 clear photos: front view, side view, different expressions. More angles = better consistency." })}</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">{_copy("copy.7448611d5f93", { defaultValue: "Visibility" })}</label>
            <div className="flex gap-2">
              {(['private', 'public'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize border transition-colors ${
                    visibility === v ? 'bg-white/15 border-white/30 text-white' : 'bg-white/5 border-white/10 text-zinc-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {visibility === 'public'
                ? 'Anyone can reference this character with @' + (slugPreview || _copy("copy.cd03861f0ff8", { defaultValue: "slug" }))
                : _copy("copy.f9e5b8d2da95", { defaultValue: "Only you can reference this character." })}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</Button>
            <LiquidGlassBubble2
              onClick={handleSave}
              disabled={isSaving}
              loading={isSaving}
              label={editing ? _copy("copy.dd0ae7a5cbcf", { defaultValue: "Save changes" }) : _copy("copy.a367a9cea7fc", { defaultValue: "Create character" })}
              width="180px"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
