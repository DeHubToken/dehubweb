import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCreateCommunity, uploadCommunityMedia } from '@/hooks/use-communities';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface CreateCommunityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  const { data } = await supabase
    .from('communities')
    .select('slug')
    .ilike('slug', `${baseSlug}%`);

  if (!data || data.length === 0) return baseSlug;

  const taken = new Set(data.map(d => d.slug.toLowerCase()));
  if (!taken.has(baseSlug)) return baseSlug;

  for (let i = 2; i < 100; i++) {
    const candidate = `${baseSlug}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseSlug}${Date.now()}`;
}

export function CreateCommunityModal({ open, onOpenChange }: CreateCommunityModalProps) {
  const navigate = useNavigate();
  const createMutation = useCreateCommunity();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation();

  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!name.trim() || name.trim().length < 3) {
      toast.error(t('communities.nameMinLength'));
      return;
    }
    if (!baseSlug) {
      toast.error(t('communities.invalidName'));
      return;
    }

    setSubmitting(true);
    try {
      const slug = await resolveUniqueSlug(baseSlug);

      let avatar_url: string | undefined;
      if (avatarFile) {
        avatar_url = await uploadCommunityMedia(avatarFile, slug, 'avatar');
      }

      const community = await createMutation.mutateAsync({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        avatar_url,
        is_private: isPrivate,
      });

      onOpenChange(false);
      setName('');
      setDescription('');
      setIsPrivate(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      navigate(`/app/communities/${community.slug}`);
    } catch {
      // error toast is handled by mutation
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass hideHandle>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-white font-medium flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('communities.createCommunity')}
            </DrawerTitle>
          </DrawerHeader>
          <button onClick={() => onOpenChange(false)} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <label className="w-14 h-14 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center cursor-pointer overflow-hidden hover:bg-white/[0.1] transition-colors">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <Image className="w-5 h-5 text-zinc-500" />
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('communities.communityName')}
                maxLength={50}
                className="w-full h-10 px-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
              />
              {baseSlug && (
                <p className="text-zinc-600 text-xs mt-1 pl-1">dehub.io/app/communities/{baseSlug}</p>
              )}
            </div>
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('communities.whatsItAbout')}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm resize-none"
          />

          <label className="flex items-center justify-between py-1 cursor-pointer">
            <span className="text-sm text-white">{t('communities.privateCommunity')}</span>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} className="data-[state=checked]:bg-white scale-75" />
          </label>

          <Button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="w-full rounded-xl bg-white text-black hover:bg-white/90 font-medium"
          >
            {submitting ? t('communities.creating') : t('communities.createCommunity')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
