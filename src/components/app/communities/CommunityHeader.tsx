import { useRef, useState, useCallback } from 'react';
import { Users, LogIn, LogOut, Crown, Camera, Pin, PinOff, TrendingUp, X, Pencil, Check, Share2, Link2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommunityTickerSearch } from './CommunityTickerSearch';
import type { DexPair } from '@/hooks/use-dexscreener';
import { uploadCommunityMedia, useUpdateCommunity, usePinnedCommunities, usePinCommunity, useUnpinCommunity } from '@/hooks/use-communities';
import type { Community } from '@/hooks/use-communities';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';
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
  const { openPostModal } = useGlobalDropZone();
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const updateMutation = useUpdateCommunity();
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);
  const [showTickerInput, setShowTickerInput] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameInput, setNameInput] = useState(community.name);
  const [descInput, setDescInput] = useState(community.description || '');

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

      {/* Avatar + buttons row */}
      <div className="flex items-start justify-between -mt-8">
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
        <div className="flex items-center gap-2 flex-shrink-0 pt-[39px]">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl gap-1.5 h-9 px-3 bg-white/[0.06] border border-white/[0.1] text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1.5">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/app/communities/${community.slug}`;
                  openPostModal(url);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
              >
                <FileText className="w-4 h-4 text-zinc-400" />
                Post
              </button>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/app/communities/${community.slug}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied!');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white hover:bg-white/10 transition-colors"
              >
                <Link2 className="w-4 h-4 text-zinc-400" />
                Copy Link
              </button>
            </PopoverContent>
          </Popover>
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

      {/* Name + member count below avatar */}
      <div className="px-2 mt-2">
        {isOwner && editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-lg font-bold text-white outline-none focus:border-white/20"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && nameInput.trim()) {
                  updateMutation.mutate({ id: community.id, name: nameInput.trim() } as any, { onSuccess: () => setEditingName(false) });
                }
                if (e.key === 'Escape') { setNameInput(community.name); setEditingName(false); }
              }}
            />
            <button onClick={() => {
              if (nameInput.trim()) updateMutation.mutate({ id: community.id, name: nameInput.trim() } as any, { onSuccess: () => setEditingName(false) });
            }} className="text-white hover:text-green-400"><Check className="w-4 h-4" /></button>
            <button onClick={() => { setNameInput(community.name); setEditingName(false); }} className="text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group/name">
            <h1 className="text-lg font-bold text-white truncate">{community.name}</h1>
            {isOwner && (
              <button onClick={() => setEditingName(true)} className="opacity-0 group-hover/name:opacity-100 text-zinc-500 hover:text-white transition-all">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
        <p className="text-zinc-500 text-sm">{community.member_count.toLocaleString()} members</p>
      </div>

      {/* Ticker assignment for owners */}
      {isOwner && (
        <div className="px-2 mt-2">
          {community.ticker_symbol ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Ticker: <span className="text-white font-medium">${community.ticker_symbol}</span>
              </span>
              <button
                onClick={() => updateMutation.mutate({
                  id: community.id,
                  ticker_symbol: null,
                  ticker_contract_address: null,
                  ticker_chain_id: null,
                  ticker_pair_address: null,
                } as any)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : showTickerInput ? (
            <CommunityTickerSearch
              onSelect={(pair: DexPair) => {
                updateMutation.mutate({
                  id: community.id,
                  ticker_symbol: pair.baseToken.symbol,
                  ticker_contract_address: pair.baseToken.address,
                  ticker_chain_id: pair.chainId,
                  ticker_pair_address: pair.pairAddress,
                } as any, {
                  onSuccess: () => {
                    setShowTickerInput(false);
                  }
                });
              }}
              onCancel={() => setShowTickerInput(false)}
            />
          ) : (
            <button
              onClick={() => setShowTickerInput(true)}
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              <TrendingUp className="w-3 h-3" />
              Assign ticker chart
            </button>
          )}
        </div>
      )}

      {isOwner && editingDesc ? (
        <div className="px-2 mt-3 flex items-start gap-1.5">
          <textarea
            value={descInput}
            onChange={e => setDescInput(e.target.value)}
            rows={2}
            className="flex-1 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/20 resize-none"
            placeholder="Community description..."
            autoFocus
          />
          <button onClick={() => {
            updateMutation.mutate({ id: community.id, description: descInput.trim() || null } as any, { onSuccess: () => setEditingDesc(false) });
          }} className="text-white hover:text-green-400 mt-1"><Check className="w-4 h-4" /></button>
          <button onClick={() => { setDescInput(community.description || ''); setEditingDesc(false); }} className="text-zinc-500 hover:text-white mt-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <div className="px-2 mt-3 group/desc flex items-start gap-1.5">
          {community.description ? (
            <p className="text-zinc-400 text-sm">{community.description}</p>
          ) : isOwner ? (
            <p className="text-zinc-600 text-sm italic">Add a description...</p>
          ) : null}
          {isOwner && (
            <button onClick={() => setEditingDesc(true)} className="opacity-0 group-hover/desc:opacity-100 text-zinc-500 hover:text-white transition-all flex-shrink-0 mt-0.5">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
