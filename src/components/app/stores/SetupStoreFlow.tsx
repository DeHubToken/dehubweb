/**
 * Setup Store Flow
 * ================
 * Store creation form — supports creating additional stores with avatar.
 */

import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Store, Loader2, ArrowLeft, Camera } from 'lucide-react';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useCreateStore, uploadStoreMedia } from '@/hooks/use-stores';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface SetupStoreFlowProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function SetupStoreFlow({ onComplete, onCancel }: SetupStoreFlowProps) {
  const { walletAddress } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const createStore = useCreateStore();

  const handleAvatarUpload = async (file: File) => {
    if (!walletAddress) return;
    setUploading(true);
    try {
      const url = await uploadStoreMedia(file, walletAddress);
      setAvatarUrl(url);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!walletAddress) return;
    setUploadingBanner(true);
    try {
      const url = await uploadStoreMedia(file, walletAddress);
      setBannerUrl(url);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createStore.mutate(
      { name: name.trim(), description: description.trim(), avatar_url: avatarUrl || undefined } as any,
      { onSuccess: () => onComplete?.() }
    );
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 max-w-md mx-auto space-y-6">
      {onCancel && (
        <button onClick={onCancel} className="self-start flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}

      {/* Avatar upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className="relative w-20 h-20 rounded-full overflow-hidden bg-white/10 border border-white/10 cursor-pointer group"
      >
        {avatarUrl ? (
          <img src={avatarUrl} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Store className="w-8 h-8 text-zinc-500" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />

      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-primary-foreground">{onCancel ? 'Create New Store' : 'Set up your Store'}</h2>
        <p className="text-sm text-zinc-400">Create your store to start selling items. Tap the icon above to add a store avatar.</p>
      </div>
      <div className="w-full space-y-3">
        <div>
          <Label className="text-zinc-300">Store Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Store" className="bg-white/5 border-white/10 placeholder:text-zinc-500" />
        </div>
        <div>
          <Label className="text-zinc-300">Description</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What do you sell?" className="bg-white/5 border-white/10 placeholder:text-zinc-500" />
        </div>
        <LiquidGlassBubble2
          label="Create Store"
          icon={<Store className="w-4 h-4" />}
          loading={createStore.isPending}
          loadingLabel="Creating..."
          disabled={!name.trim() || uploading}
          onClick={handleCreate}
          width="100%"
          height="42px"
        />
      </div>
    </div>
  );
}
