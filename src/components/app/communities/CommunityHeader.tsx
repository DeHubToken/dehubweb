import { useRef, useState, useCallback } from 'react';
import { Users, LogIn, LogOut, Crown, Camera, Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadCommunityMedia, useUpdateCommunity, usePinnedCommunities, usePinCommunity, useUnpinCommunity } from '@/hooks/use-communities';
import type { Community } from '@/hooks/use-communities';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CommunityHeaderProps {
  community: Community;
  isMember: boolean;
  isOwner: boolean;
  isPending: boolean;
  onJoinLeave: () => void;
}

export function CommunityHeader({ community, isMember, isOwner, isPending, onJoinLeave }: CommunityHeaderProps) {
  const { walletAddress } = useAuth();
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateCommunity();
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);

  const { data: pinned = [] } = usePinnedCommunities(walletAddress);
  const pinMutation = usePinCommunity();
  const unpinMutation = useUnpinCommunity();
  const isPinned = pinned.some(p => p.community_id === community.id);

  const handleMediaChange = useCallback(async (file: File, type: 'avatar' | 'banner') => {
    setUploading(type);
    try {
      const url = await uploadCommunityMedia(file, community.slug, type);
      await updateMutation.mutateAsync({
        id: community.id,
        [type === 'avatar' ? 'avatar_url' : 'banner_url']: url,
      });
    } catch {
      toast.error(`Failed to upload ${type}`);
    } finally {
      setUploading(null);
    }
  }, [community.id, community.slug, updateMutation]);

  const handlePinToggle = () => {
    if (isPinned) {
      unpinMutation.mutate(community.id);
    } else if (pinned.length < 3) {
      pinMutation.mutate({ communityId: community.id, displayOrder: pinned.length });
    } else {
      toast.error('You can only pin up to 3 communities');
    }
  };

  return (
    <div className="px-3 pt-3 pb-4">
      {/* Banner */}
      <div
        className="h-28 sm:h-36 rounded-xl bg-white/[0.04] overflow-hidden relative group"
        onClick={isOwner ? () => bannerInputRef.current?.click() : undefined}
        style={isOwner ? { cursor: 'pointer' } : undefined}
      >
        {community.banner_url ? (
          <img src={community.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
        )}
        {isOwner && (
          <>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleMediaChange(f, 'banner');
                e.target.value = '';
              }}
            />
          </>
        )}
        {uploading === 'banner' && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Avatar + info */}
      <div className="flex items-end gap-3 -mt-8 px-2">
        <div
          className="w-16 h-16 rounded-xl bg-black border-2 border-black flex items-center justify-center overflow-hidden flex-shrink-0 relative group"
          onClick={isOwner ? () => avatarInputRef.current?.click() : undefined}
          style={isOwner ? { cursor: 'pointer' } : undefined}
        >
          {community.avatar_url ? (
            <img src={community.avatar_url} alt={community.name} className="w-full h-full object-cover" />
          ) : (
            <Users className="w-7 h-7 text-zinc-500" />
          )}
          {isOwner && (
            <>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleMediaChange(f, 'avatar');
                  e.target.value = '';
                }}
              />
            </>
          )}
          {uploading === 'avatar' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pb-1">
          <h1 className="text-lg font-bold text-white truncate">{community.name}</h1>
          <p className="text-zinc-500 text-sm">{community.member_count.toLocaleString()} members</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isMember && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePinToggle}
              disabled={pinMutation.isPending || unpinMutation.isPending}
              className={`rounded-xl gap-1.5 h-9 px-3 ${
                isPinned
                  ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15'
                  : 'bg-white/[0.06] border border-white/[0.1] text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {isPinned ? 'Unpin' : 'Pin'}
            </Button>
          )}
          <Button
            size="sm"
            disabled={isPending || isOwner}
            onClick={onJoinLeave}
            className={`rounded-xl gap-1.5 ${
              isMember 
                ? 'bg-white/10 border border-white/20 text-white hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            {isOwner ? (
              <><Crown className="w-3.5 h-3.5" /> Owner</>
            ) : isMember ? (
              <><LogOut className="w-3.5 h-3.5" /> Leave</>
            ) : (
              <><LogIn className="w-3.5 h-3.5" /> Join</>
            )}
          </Button>
        </div>
      </div>

      {community.description && (
        <p className="text-zinc-400 text-sm mt-3 px-2">{community.description}</p>
      )}
    </div>
  );
}
