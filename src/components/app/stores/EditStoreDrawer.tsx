/**
 * Edit Store Drawer
 * ==================
 * Allows store owner to edit name, description, avatar, and banner.
 */

import { useState, useEffect, useRef } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, Store } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useUpdateStore, uploadStoreMedia } from '@/hooks/use-stores';
import { useAuth } from '@/contexts/AuthContext';
import { GLASS_STYLES } from '@/constants/app.constants';
import { toast } from 'sonner';

interface Props {
  store: any;
  open: boolean;
  onClose: () => void;
}

export function EditStoreDrawer({ store, open, onClose }: Props) {
  const { walletAddress } = useAuth();
  const updateStore = useUpdateStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (store) {
      setName(store.name || '');
      setDescription(store.description || '');
      setAvatarUrl(store.avatar_url || '');
      setBannerUrl(store.banner_url || '');
    }
  }, [store]);

  if (!store) return null;

  const handleUpload = async (file: File, type: 'avatar' | 'banner') => {
    if (!walletAddress) return;
    const setter = type === 'avatar' ? setUploadingAvatar : setUploadingBanner;
    setter(true);
    try {
      const url = await uploadStoreMedia(file, walletAddress);
      if (type === 'avatar') setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setter(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Store name is required'); return; }
    updateStore.mutate({
      id: store.id,
      name: name.trim(),
      description: description.trim(),
      avatar_url: avatarUrl || null,
      banner_url: bannerUrl || null,
    } as any, { onSuccess: () => onClose() });
  };

  return (
    <Drawer open={open} onOpenChange={v => !v && onClose()}>
      <DrawerContent className={GLASS_STYLES.drawer}>
        <DrawerHeader>
          <DrawerTitle>Edit Store</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Banner */}
          <div>
            <Label className="text-zinc-300 text-xs mb-1.5 block">Banner Image</Label>
            <div
              onClick={() => bannerInputRef.current?.click()}
              className="relative w-full h-24 rounded-xl overflow-hidden bg-white/5 border border-white/10 cursor-pointer group"
            >
              {bannerUrl ? (
                <img src={bannerUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02]" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingBanner ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
              </div>
            </div>
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'banner')} />
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div>
              <Label className="text-zinc-300 text-xs mb-1.5 block">Avatar</Label>
              <div
                onClick={() => avatarInputRef.current?.click()}
                className="relative w-16 h-16 rounded-full overflow-hidden bg-white/10 border border-white/10 cursor-pointer group"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Store className="w-6 h-6 text-zinc-500" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Camera className="w-4 h-4 text-white" />}
                </div>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'avatar')} />
            </div>
            <div className="flex-1">
              <Label className="text-zinc-300 text-xs">Store Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-white/5 border-white/10" />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-zinc-300 text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What do you sell?"
              className="bg-white/5 border-white/10 min-h-[80px] resize-none"
            />
          </div>

          {/* Save */}
          <LiquidGlassBubble2
            label="Save Changes"
            loading={updateStore.isPending}
            loadingLabel="Saving..."
            disabled={!name.trim() || uploadingAvatar || uploadingBanner}
            onClick={handleSave}
            width="100%"
            height="42px"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
